/**
 * AROMA PLUS — REAL DATA IMPORT
 *
 * Imports 372 customers, ~480 branches, ~1050 devices from 3 CSV files.
 *
 * Usage:
 *   node scripts/import-real-data/import.js --dry-run     ← no DB writes, prints stats
 *   node scripts/import-real-data/import.js --write       ← WIPES DB then writes
 *
 * Steps:
 *   1) Read & parse 3 CSVs
 *   2) Build clean customers (dedupe, fix prices)
 *   3) Build clean branches (link to customers)
 *   4) Build clean devices (link to branches, normalize types, fill default rates)
 *   5) If --write: drop collections, insert in dependency order
 *   6) Print full report
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mongoose = require('mongoose');

const Customer = require('../../src/models/Customer');
const Branch = require('../../src/models/Branch');
const Device = require('../../src/models/Device');
const Scent = require('../../src/models/Scent');
const DeviceType = require('../../src/models/DeviceType');

const DATA_DIR = 'C:/Users/user/ארומה מידע';
const F = {
  branches: path.join(DATA_DIR, 'בתי העסק-כל הלקוחות (2).csv'),
  customers: path.join(DATA_DIR, 'עיסקאות_ שם המשלם-ראשי.csv'),
  devices: path.join(DATA_DIR, 'פרוט המכשירים-כל המכשירים.csv'),
};

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--write');

// === defaults derived from real data averages ===
const DEFAULT_RATE_BY_TYPE = {
  'גדול*': 145,
  'גדול': 145,
  'אפליקציה': 180,
  'קטן': 115,
  'קטן בבפנים': 100,
  'hearing 5': 110,
  'הרינג 6': 110,
  'טאבלט': 140,
  'טאבלט 9': 90,
  'דנקיו': 140,
  'דנקיו 2': 130,
  'דנקיו, גדול': 145,
  'בינוני': 100,
  'ליטר': 200,
  'מכשיליטר': 250,
  'גדול ואפליקציה': 300,
  'לא ידוע': 115,
};

// === type normalization (typos & combos) ===
const TYPE_NORMALIZE = {
  'אפלקציה': 'אפליקציה',
  'גדול ואפקציה': 'גדול ואפליקציה',
  'לא ידוע סוג מכשיר -': 'לא ידוע',
  'לא ידוע  סוג מכשיר -': 'לא ידוע',
  '': 'לא ידוע',
};

// ---------- helpers ----------
function readCsv(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true, bom: true });
}

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

function cleanPayer(s) {
  // CSV often has "  "name"  " — strip outer quotes & double-quote escapes
  if (!s) return '';
  return norm(String(s).replace(/^"|"$/g, '').replace(/""/g, '"'));
}

function parsePrice(cell) {
  if (!cell) return null;
  const cleaned = String(cell).replace(/₪|,|\s/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (n > 50000) return null; // concatenated junk
  return n;
}

function parseDeviceRate(cell) {
  if (!cell) return null;
  const s = String(cell).replace(/₪|\s/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(',');
  let total = 0;
  let any = false;
  for (const p of parts) {
    const m = p.match(/^(\d+)\*(\d+(\.\d+)?)$/);
    if (m) { total += Number(m[1]) * Number(m[2]); any = true; continue; }
    const m2 = p.match(/^(\d+(\.\d+)?)$/);
    if (m2) { total += Number(m2[1]); any = true; continue; }
    return null;
  }
  return any ? total : null;
}

function parseDate(s) {
  // "28/2/2025 13:07" or "28/2/2025"
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function normalizeType(t) {
  const n = norm(t);
  return TYPE_NORMALIZE[n] !== undefined ? TYPE_NORMALIZE[n] : n;
}

// ---------- main ----------
async function main() {
  console.log('================================================================');
  console.log(`  AROMA PLUS — DATA IMPORT  ${DRY_RUN ? '[DRY RUN]' : '[!! WRITE MODE !!]'}`);
  console.log('================================================================\n');

  console.log('שלב 1: קריאת קבצי CSV...');
  const customersRaw = readCsv(F.customers);
  const branchesRaw = readCsv(F.branches);
  const devicesRaw = readCsv(F.devices);
  console.log(`  לקוחות: ${customersRaw.length}, סניפים: ${branchesRaw.length}, מכשירים: ${devicesRaw.length}\n`);

  // ---------- STEP 2: build customers ----------
  console.log('שלב 2: בניית לקוחות (עם dedupe ותיקון מחירים)...');
  /** @type {Map<string, {name, monthlyPrice, status, notes}>} */
  const customers = new Map();
  let custDup = 0, custBadPrice = 0;

  for (const row of customersRaw) {
    const name = cleanPayer(row['שם המשלם']);
    if (!name) continue;
    if (customers.has(name)) { custDup++; continue; }
    const priceBefore = parsePrice(row['מחיר חודשי לפני מע"מ']);
    if (row['מחיר חודשי לפני מע"מ'] && priceBefore === null) custBadPrice++;
    const isActive = norm(row['פעיל/ לא פעיל']) === 'checked';
    customers.set(name, {
      name,
      monthlyPrice: priceBefore || 0,
      status: 'active', // CSV all "בתהליך", treat as active
      notes: [
        row['כפילויות'] ? `כפילויות מקור: ${row['כפילויות']}` : null,
        priceBefore === null && row['מחיר חודשי לפני מע"מ'] ? `מחיר מקורי לא תקין: ${row['מחיר חודשי לפני מע"מ']}` : null,
      ].filter(Boolean).join(' | ') || undefined,
    });
  }
  console.log(`  לקוחות ייחודיים: ${customers.size}, dedup: ${custDup}, מחיר אופס בגלל שבירה: ${custBadPrice}\n`);

  // ---------- STEP 3: build branches ----------
  console.log('שלב 3: בניית סניפים (קישור ללקוחות)...');
  /** @type {Array<{branchKey, customerName, branchName, city, region, address, visitIntervalDays, isActive, notes}>} */
  const branches = [];
  const branchesByKey = new Map(); // key → index in branches[]
  const branchesByFullName = new Map(); // "שם הלקוח" full string → key
  let brSkipNoName = 0, brDup = 0, brAutoCustomer = 0;

  function makeBranchKey(customerName, branchName, city, region) {
    return `${customerName}::${branchName}::${city}::${region}`;
  }

  for (const row of branchesRaw) {
    const fullName = norm(row['שם הלקוח']);
    let branchName = norm(row['בית העסק']);
    const city = norm(row['עיר']) || 'ללא עיר';
    const region = norm(row['אזור']);
    const address = norm(row['כתובת']);
    let payer = cleanPayer(row['עיסקאות/ שם המשלם']);

    if (!branchName) { brSkipNoName++; continue; }

    // No payer? auto-create customer with branch name
    if (!payer) {
      payer = branchName;
      if (!customers.has(payer)) {
        customers.set(payer, { name: payer, monthlyPrice: 0, status: 'active', notes: 'נוצר אוטומטית מסניף ללא משלם' });
        brAutoCustomer++;
      }
    }
    // Payer not in customers list? auto-create
    if (!customers.has(payer)) {
      customers.set(payer, { name: payer, monthlyPrice: 0, status: 'active', notes: 'נוצר אוטומטית מסניף - משלם לא היה ברשימה' });
      brAutoCustomer++;
    }

    const visitInterval = Number(row['כל כמה ימים לקבוע ביקור']) || 30;
    const isActive = norm(row['בית עסק פעיל/ לא']) !== 'inactive'; // crude: active unless marked otherwise
    const confirmLink = norm(row['קישור אישי לאישור ביקור']);
    const visitNotes = norm(row['הערות לביקור']);

    const key = makeBranchKey(payer, branchName, city, region);
    if (branchesByKey.has(key)) { brDup++; continue; }

    branches.push({
      key,
      customerName: payer,
      branchName,
      city,
      region,
      address,
      visitIntervalDays: visitInterval,
      isActive,
      notes: [confirmLink ? `קישור אישור: ${confirmLink}` : null, visitNotes].filter(Boolean).join(' | ') || undefined,
      _firstInstall: parseDate(row['תאריך התקנה ראשונה']),
      _lastVisit: parseDate(row['תאריך ביקור אחרון']),
    });
    const idx = branches.length - 1;
    branchesByKey.set(key, idx);
    if (fullName) branchesByFullName.set(fullName, idx);
    // Also register by branchName alone for fuzzy match
    branchesByFullName.set(`${branchName}|${city}`, idx);
  }
  console.log(`  סניפים סופיים: ${branches.length}, דולג (אין שם): ${brSkipNoName}, dedup: ${brDup}, לקוחות שנוצרו אוטו': ${brAutoCustomer}\n`);

  // ---------- STEP 4: build devices ----------
  console.log('שלב 4: בניית מכשירים...');
  /** @type {Array<{branchKey, deviceType, scentName, locationInBranch, monthlyRate, mlPerRefill, isActive, notes}>} */
  const devices = [];
  const scentSet = new Set();
  const typeSet = new Set();
  let devNoBranch = 0, devNoMatchBranch = 0, devDefaultRate = 0, devBadRate = 0, devAutoBranch = 0;

  for (const row of devicesRaw) {
    const fullBranchName = norm(row['בית העסק']);
    const typeRaw = row['סוג המכשיר'];
    const scent = norm(row['הריחות']);
    const payer = cleanPayer(row['עיסקאות/ שם המשלם']);
    const location = norm(row['מיקום']);
    const rateRaw = row['תעריף'];
    const rateParsed = parseDeviceRate(rateRaw);
    const lastRefill = parseDate(row['תאריך עדכון מ"ל אחרון']);

    const type = normalizeType(typeRaw);

    let branchIdx;
    if (!fullBranchName) {
      // Device without branch — create a "general" branch for the customer
      devNoBranch++;
      if (!payer) continue; // can't link
      const fakeBranchName = `כללי - ${payer}`;
      const key = makeBranchKey(payer, fakeBranchName, 'ללא עיר', '');
      if (!branchesByKey.has(key)) {
        if (!customers.has(payer)) {
          customers.set(payer, { name: payer, monthlyPrice: 0, status: 'active', notes: 'נוצר אוטומטית ממכשיר' });
        }
        branches.push({
          key, customerName: payer, branchName: fakeBranchName,
          city: 'ללא עיר', region: '', address: '',
          visitIntervalDays: 30, isActive: true,
          notes: 'נוצר אוטומטית - כל המכשירים שלא היו משויכים לסניף',
        });
        branchesByKey.set(key, branches.length - 1);
        devAutoBranch++;
      }
      branchIdx = branchesByKey.get(key);
    } else {
      // Look up by full name first, then by branchName|city fallback
      branchIdx = branchesByFullName.get(fullBranchName);
      if (branchIdx === undefined) {
        // Try fuzzy: shortname after splitting by " - "
        const parts = fullBranchName.split(' - ');
        if (parts.length >= 2) {
          const guessShort = parts[0].trim();
          const guessCity = parts[1].trim();
          branchIdx = branchesByFullName.get(`${guessShort}|${guessCity}`);
        }
      }
      if (branchIdx === undefined) { devNoMatchBranch++; continue; }
    }

    const branch = branches[branchIdx];

    let monthlyRate = rateParsed;
    if (monthlyRate === null) {
      if (rateRaw && String(rateRaw).trim()) devBadRate++;
      monthlyRate = DEFAULT_RATE_BY_TYPE[type] ?? 100;
      devDefaultRate++;
    }

    if (scent) scentSet.add(scent);
    typeSet.add(type);

    devices.push({
      branchKey: branch.key,
      deviceType: type,
      scentName: scent || 'לא ידוע',
      locationInBranch: location,
      monthlyRate,
      mlPerRefill: 100,
      isActive: true,
      lastRefillDate: lastRefill,
      notes: [
        rateRaw && rateParsed === null ? `תעריף מקורי לא תקין: ${rateRaw}` : null,
      ].filter(Boolean).join(' | ') || undefined,
    });
  }
  console.log(`  מכשירים סופיים: ${devices.length}`);
  console.log(`  ללא סניף → סניף "כללי": ${devNoBranch}, סניפים אוטו' שנוצרו: ${devAutoBranch}`);
  console.log(`  לא נמצא סניף → דילוג: ${devNoMatchBranch}`);
  console.log(`  תעריף ברירת מחדל: ${devDefaultRate}, תעריף שבור: ${devBadRate}`);
  console.log(`  סוגי מכשיר ייחודיים: ${typeSet.size}, ריחות ייחודיים: ${scentSet.size}\n`);

  // ---------- STEP 5: Final report ----------
  console.log('================================================================');
  console.log('  סיכום סופי לפני כתיבה ל-DB:');
  console.log('================================================================');
  console.log(`  לקוחות:    ${customers.size}`);
  console.log(`  סניפים:    ${branches.length}`);
  console.log(`  מכשירים:   ${devices.length}`);
  console.log(`  סוגים:     ${typeSet.size}`);
  console.log(`  ריחות:     ${scentSet.size}`);
  const totalMonthly = devices.reduce((s, d) => s + d.monthlyRate, 0);
  console.log(`  סך תעריפים חודשי (מכל המכשירים): ${totalMonthly.toLocaleString('he-IL')} ₪`);
  console.log('================================================================\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — לא נכתב כלום ל-DB.');
    console.log('   להרצה אמיתית: node scripts/import-real-data/import.js --write');
    return;
  }

  // ---------- STEP 6: WRITE TO DB ----------
  console.log('🔌 מתחבר ל-MongoDB...');
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(uri);
  console.log('✓ חיבור הצליח\n');

  console.log('🗑️  מאפס DB (Customer, Branch, Device, Scent, DeviceType)...');
  await Promise.all([
    Customer.deleteMany({}),
    Branch.deleteMany({}),
    Device.deleteMany({}),
    Scent.deleteMany({}),
    DeviceType.deleteMany({}),
  ]);
  console.log('✓ DB ריק\n');

  console.log('💾 כותב סוגי מכשיר...');
  const typeDocs = await DeviceType.insertMany(
    [...typeSet].map(name => ({
      name,
      mlPerRefill: 100,
      defaultRefillInterval: 30,
      price: DEFAULT_RATE_BY_TYPE[name] ?? 100,
    }))
  );
  console.log(`✓ ${typeDocs.length} סוגי מכשיר\n`);

  console.log('💾 כותב ריחות...');
  const scentDocs = await Scent.insertMany([...scentSet].map(name => ({ name, stockQuantity: 0 })));
  const scentByName = new Map(scentDocs.map(s => [s.name, s._id]));
  console.log(`✓ ${scentDocs.length} ריחות\n`);

  console.log('💾 כותב לקוחות...');
  const customerDocs = await Customer.insertMany([...customers.values()]);
  const customerByName = new Map(customerDocs.map(c => [c.name, c._id]));
  console.log(`✓ ${customerDocs.length} לקוחות\n`);

  console.log('💾 כותב סניפים...');
  const branchInsertDocs = branches.map(b => ({
    customerId: customerByName.get(b.customerName),
    branchName: b.branchName,
    city: b.city,
    region: b.region,
    address: b.address,
    visitIntervalDays: b.visitIntervalDays,
    isActive: b.isActive,
    notes: b.notes,
  }));
  const branchDocs = await Branch.insertMany(branchInsertDocs);
  // Map branchKey → _id by re-deriving keys in insertion order
  const branchIdByKey = new Map();
  branches.forEach((b, i) => { branchIdByKey.set(b.key, branchDocs[i]._id); });
  console.log(`✓ ${branchDocs.length} סניפים\n`);

  console.log('💾 כותב מכשירים...');
  const deviceInsertDocs = devices.map(d => ({
    branchId: branchIdByKey.get(d.branchKey),
    deviceType: d.deviceType,
    scentId: scentByName.get(d.scentName),
    locationInBranch: d.locationInBranch,
    monthlyRate: d.monthlyRate,
    mlPerRefill: d.mlPerRefill,
    isActive: d.isActive,
    lastRefillDate: d.lastRefillDate,
    notes: d.notes,
  })).filter(d => d.branchId); // safety
  // chunk for large insert
  const CHUNK = 500;
  for (let i = 0; i < deviceInsertDocs.length; i += CHUNK) {
    await Device.insertMany(deviceInsertDocs.slice(i, i + CHUNK));
  }
  console.log(`✓ ${deviceInsertDocs.length} מכשירים\n`);

  await mongoose.disconnect();
  console.log('✅ ייבוא הסתיים בהצלחה!\n');
}

main().catch(err => {
  console.error('❌ שגיאה:', err);
  process.exit(1);
});
