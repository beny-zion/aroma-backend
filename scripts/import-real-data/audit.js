/**
 * Post-import audit:
 *   1) Confirm what's in the DB (counts, breakdowns)
 *   2) Re-parse CSVs and write CSV files of EVERYTHING that was skipped/altered
 *
 * Outputs to scripts/import-real-data/audit-output/
 *   - skipped-branches-no-name.csv         (5 rows)
 *   - skipped-branches-duplicates.csv      (6 rows)
 *   - skipped-devices-no-branch-match.csv  (52 rows)
 *   - duplicate-customers.csv              (15 rows merged)
 *   - customers-broken-price.csv           (31 rows reset)
 *   - devices-broken-rate.csv              (7 rows reset)
 *   - devices-default-rate.csv             (488 rows that got DEFAULT instead of CSV value)
 *   - audit-summary.txt
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mongoose = require('mongoose');

const Customer = require('../../src/models/Customer');
const Branch = require('../../src/models/Branch');
const Device = require('../../src/models/Device');

const DATA_DIR = 'C:/Users/user/ארומה מידע';
const OUT_DIR = path.join(__dirname, 'audit-output');

const F = {
  branches: path.join(DATA_DIR, 'בתי העסק-כל הלקוחות (2).csv'),
  customers: path.join(DATA_DIR, 'עיסקאות_ שם המשלם-ראשי.csv'),
  devices: path.join(DATA_DIR, 'פרוט המכשירים-כל המכשירים.csv'),
};

const DEFAULT_RATE_BY_TYPE = {
  'גדול*': 145, 'גדול': 145, 'אפליקציה': 180, 'קטן': 115, 'קטן בבפנים': 100,
  'hearing 5': 110, 'הרינג 6': 110, 'טאבלט': 140, 'טאבלט 9': 90, 'דנקיו': 140,
  'דנקיו 2': 130, 'דנקיו, גדול': 145, 'בינוני': 100, 'ליטר': 200, 'מכשיליטר': 250,
  'גדול ואפליקציה': 300, 'לא ידוע': 115,
};
const TYPE_NORMALIZE = {
  'אפלקציה': 'אפליקציה', 'גדול ואפקציה': 'גדול ואפליקציה',
  'לא ידוע סוג מכשיר -': 'לא ידוע', 'לא ידוע  סוג מכשיר -': 'לא ידוע', '': 'לא ידוע',
};

function readCsv(file) {
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true, bom: true });
}
function norm(s) { return s ? String(s).replace(/\s+/g, ' ').trim() : ''; }
function cleanPayer(s) { return s ? norm(String(s).replace(/^"|"$/g, '').replace(/""/g, '"')) : ''; }
function parsePrice(c) { if (!c) return null; const x = String(c).replace(/₪|,|\s/g, ''); if (!x || !/^\d+(\.\d+)?$/.test(x)) return null; const n = Number(x); return n > 50000 ? null : n; }
function parseDeviceRate(c) {
  if (!c) return null;
  const s = String(c).replace(/₪|\s/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const parts = s.split(',');
  let total = 0, any = false;
  for (const p of parts) {
    const m = p.match(/^(\d+)\*(\d+(\.\d+)?)$/);
    if (m) { total += Number(m[1]) * Number(m[2]); any = true; continue; }
    const m2 = p.match(/^(\d+(\.\d+)?)$/);
    if (m2) { total += Number(m2[1]); any = true; continue; }
    return null;
  }
  return any ? total : null;
}
function normalizeType(t) { const n = norm(t); return TYPE_NORMALIZE[n] !== undefined ? TYPE_NORMALIZE[n] : n; }

// CSV writer (Excel-friendly UTF-8 BOM + CRLF)
function writeCsv(filename, rows, header) {
  const escape = v => { const s = v == null ? '' : String(v); return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => escape(r[h])).join(','));
  fs.writeFileSync(path.join(OUT_DIR, filename), '﻿' + lines.join('\r\n'), 'utf8');
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const customersRaw = readCsv(F.customers);
  const branchesRaw = readCsv(F.branches);
  const devicesRaw = readCsv(F.devices);

  // === collect what would happen ===
  const customers = new Map();
  const dupCustomers = [];
  const brokenPriceCustomers = [];

  for (const row of customersRaw) {
    const name = cleanPayer(row['שם המשלם']);
    if (!name) continue;
    if (customers.has(name)) {
      dupCustomers.push({
        שם_כפול: name,
        שורה_מקור: JSON.stringify({
          סטטוס: row['סטטוס עיסקה'],
          מחיר: row['מחיר חודשי לפני מע"מ'],
          'last modified': row['Last Modified']
        }),
      });
      continue;
    }
    const priceBefore = parsePrice(row['מחיר חודשי לפני מע"מ']);
    if (row['מחיר חודשי לפני מע"מ'] && priceBefore === null) {
      brokenPriceCustomers.push({
        שם_לקוח: name,
        מחיר_מקורי_שבור: row['מחיר חודשי לפני מע"מ'],
        מחיר_שנכנס: 0,
        הערה: 'מספרים מודבקים זה לזה - אופס. ערוך ידנית במערכת.',
      });
    }
    customers.set(name, true);
  }

  const branchesByKey = new Map();
  const branchesByFullName = new Map();
  const skippedBranchesNoName = [];
  const skippedBranchesDup = [];

  function makeBranchKey(c, b, ci, r) { return `${c}::${b}::${ci}::${r}`; }

  for (const row of branchesRaw) {
    const fullName = norm(row['שם הלקוח']);
    const branchName = norm(row['בית העסק']);
    const city = norm(row['עיר']) || 'ללא עיר';
    const region = norm(row['אזור']);
    let payer = cleanPayer(row['עיסקאות/ שם המשלם']);

    if (!branchName) {
      skippedBranchesNoName.push({
        'שם_מלא_מקור': fullName,
        עיר: city,
        אזור: region,
        משלם: payer,
        כתובת: norm(row['כתובת']),
        תאריך_יצירה: row['תאריך יצירה'],
      });
      continue;
    }

    if (!payer) payer = branchName;

    const key = makeBranchKey(payer, branchName, city, region);
    if (branchesByKey.has(key)) {
      skippedBranchesDup.push({
        שם_עסק: branchName, עיר: city, אזור: region, משלם: payer,
        'שם_מלא_מקור': fullName,
        כתובת: norm(row['כתובת']),
        הערה: 'אותו שם+עיר+אזור+משלם כבר נכנס. השורה השנייה דולגה',
      });
      continue;
    }

    branchesByKey.set(key, true);
    if (fullName) branchesByFullName.set(fullName, key);
    branchesByFullName.set(`${branchName}|${city}`, key);
  }

  const skippedDevicesNoMatch = [];
  const devicesBrokenRate = [];
  const devicesDefaultRate = [];

  for (const row of devicesRaw) {
    const fullBranchName = norm(row['בית העסק']);
    const typeRaw = row['סוג המכשיר'];
    const scent = norm(row['הריחות']);
    const payer = cleanPayer(row['עיסקאות/ שם המשלם']);
    const location = norm(row['מיקום']);
    const rateRaw = row['תעריף'];
    const rate = parseDeviceRate(rateRaw);
    const type = normalizeType(typeRaw);

    let matched = false;
    if (!fullBranchName) {
      if (payer) matched = true; // becomes "כללי" branch
    } else if (branchesByFullName.has(fullBranchName)) {
      matched = true;
    } else {
      const parts = fullBranchName.split(' - ');
      if (parts.length >= 2 && branchesByFullName.has(`${parts[0].trim()}|${parts[1].trim()}`)) matched = true;
    }

    if (!matched) {
      skippedDevicesNoMatch.push({
        בית_עסק_במקור: fullBranchName, משלם: payer, סוג: typeRaw, ריח: scent,
        מיקום: location, תעריף: rateRaw,
        זיהוי_מכשיר: row['זיהוי המכשירים'],
        הערה: 'הסניף המוזכר בקובץ המכשירים לא קיים בקובץ הסניפים. ייצור ידנית ושייך.',
      });
      continue;
    }

    if (rateRaw && rate === null) {
      devicesBrokenRate.push({
        בית_עסק: fullBranchName, סוג: type, ריח: scent, מיקום: location,
        תעריף_מקורי_שבור: rateRaw,
        תעריף_שנכנס: DEFAULT_RATE_BY_TYPE[type] ?? 100,
        הערה: 'התעריף לא היה ניתן לפירסור - הוחלף בברירת מחדל לפי סוג. ערוך ידנית.',
      });
    } else if (!rateRaw || !String(rateRaw).trim()) {
      devicesDefaultRate.push({
        בית_עסק: fullBranchName, סוג: type, ריח: scent, מיקום: location,
        תעריף_שנכנס: DEFAULT_RATE_BY_TYPE[type] ?? 100,
        הערה: 'לא היה תעריף ב-CSV. הוחלף בברירת מחדל לפי סוג.',
      });
    }
  }

  // === Write CSV reports ===
  console.log(`כותב דוחות ל-${OUT_DIR}\n`);

  writeCsv('duplicate-customers.csv', dupCustomers, ['שם_כפול', 'שורה_מקור']);
  writeCsv('customers-broken-price.csv', brokenPriceCustomers, ['שם_לקוח', 'מחיר_מקורי_שבור', 'מחיר_שנכנס', 'הערה']);
  writeCsv('skipped-branches-no-name.csv', skippedBranchesNoName, ['שם_מלא_מקור', 'עיר', 'אזור', 'משלם', 'כתובת', 'תאריך_יצירה']);
  writeCsv('skipped-branches-duplicates.csv', skippedBranchesDup, ['שם_עסק', 'עיר', 'אזור', 'משלם', 'שם_מלא_מקור', 'כתובת', 'הערה']);
  writeCsv('skipped-devices-no-branch-match.csv', skippedDevicesNoMatch, ['בית_עסק_במקור', 'משלם', 'סוג', 'ריח', 'מיקום', 'תעריף', 'זיהוי_מכשיר', 'הערה']);
  writeCsv('devices-broken-rate.csv', devicesBrokenRate, ['בית_עסק', 'סוג', 'ריח', 'מיקום', 'תעריף_מקורי_שבור', 'תעריף_שנכנס', 'הערה']);
  writeCsv('devices-default-rate.csv', devicesDefaultRate, ['בית_עסק', 'סוג', 'ריח', 'מיקום', 'תעריף_שנכנס', 'הערה']);

  // === Connect to DB and verify ===
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const [custCount, branchCount, deviceCount] = await Promise.all([
    Customer.countDocuments(),
    Branch.countDocuments(),
    Device.countDocuments(),
  ]);

  const cityAgg = await Branch.aggregate([
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const typeAgg = await Device.aggregate([
    { $group: { _id: '$deviceType', count: { $sum: 1 }, totalRate: { $sum: '$monthlyRate' }, avgRate: { $avg: '$monthlyRate' } } },
    { $sort: { count: -1 } },
  ]);

  const totalMonthlyAgg = await Device.aggregate([{ $group: { _id: null, total: { $sum: '$monthlyRate' } } }]);
  const totalMonthly = totalMonthlyAgg[0]?.total || 0;

  // Top customers by branch count
  const topCustomers = await Branch.aggregate([
    { $group: { _id: '$customerId', branchCount: { $sum: 1 } } },
    { $sort: { branchCount: -1 } },
    { $limit: 10 },
    { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
    { $unwind: '$customer' },
    { $project: { name: '$customer.name', branchCount: 1 } },
  ]);

  // Customers with no branches (orphans)
  const orphanCustomersAgg = await Customer.aggregate([
    { $lookup: { from: 'branches', localField: '_id', foreignField: 'customerId', as: 'branches' } },
    { $match: { 'branches.0': { $exists: false } } },
    { $project: { name: 1 } },
  ]);

  // Branches with no devices
  const branchesNoDevices = await Branch.aggregate([
    { $lookup: { from: 'devices', localField: '_id', foreignField: 'branchId', as: 'devices' } },
    { $match: { 'devices.0': { $exists: false } } },
    { $project: { branchName: 1, city: 1 } },
  ]);

  await mongoose.disconnect();

  // === Build summary ===
  const lines = [];
  const out = (s = '') => { lines.push(s); console.log(s); };

  out('='.repeat(64));
  out('  AROMA PLUS — POST-IMPORT AUDIT');
  out('='.repeat(64));
  out();
  out(`📊 ב-DB עכשיו:`);
  out(`   לקוחות:    ${custCount}`);
  out(`   סניפים:    ${branchCount}`);
  out(`   מכשירים:   ${deviceCount}`);
  out(`   סך חודשי מצרפי: ${totalMonthly.toLocaleString('he-IL')} ₪`);
  out();

  out(`🏙️  סניפים לפי עיר:`);
  cityAgg.forEach(c => out(`   ${(c._id || '(ריק)').padEnd(20)} ${c.count}`));
  out();

  out(`🔧 מכשירים לפי סוג:`);
  typeAgg.forEach(t => {
    out(`   ${(t._id || '(ריק)').padEnd(20)} n=${t.count.toString().padStart(4)}  סך=${Math.round(t.totalRate).toLocaleString('he-IL').padStart(8)} ₪  ממוצע=${Math.round(t.avgRate)}`);
  });
  out();

  out(`👑 טופ 10 לקוחות לפי סניפים:`);
  topCustomers.forEach((c, i) => out(`   ${(i + 1).toString().padStart(2)}. ${c.name.padEnd(35)} ${c.branchCount} סניפים`));
  out();

  out(`🚨 לקוחות ללא סניפים (יתומים): ${orphanCustomersAgg.length}`);
  if (orphanCustomersAgg.length) {
    orphanCustomersAgg.slice(0, 10).forEach(c => out(`   → ${c.name}`));
    if (orphanCustomersAgg.length > 10) out(`   ...ועוד ${orphanCustomersAgg.length - 10}`);
  }
  out();

  out(`🚨 סניפים ללא מכשירים: ${branchesNoDevices.length}`);
  if (branchesNoDevices.length) {
    branchesNoDevices.slice(0, 10).forEach(b => out(`   → ${b.branchName} / ${b.city}`));
    if (branchesNoDevices.length > 10) out(`   ...ועוד ${branchesNoDevices.length - 10}`);
  }
  out();

  out('='.repeat(64));
  out('📁 דוחות CSV נכתבו (UTF-8 BOM, פתוחים ב-Excel):');
  out('='.repeat(64));
  out(`   ${path.join(OUT_DIR, 'duplicate-customers.csv').replace(/\\/g, '/')}                 (${dupCustomers.length})`);
  out(`   ${path.join(OUT_DIR, 'customers-broken-price.csv').replace(/\\/g, '/')}              (${brokenPriceCustomers.length})`);
  out(`   ${path.join(OUT_DIR, 'skipped-branches-no-name.csv').replace(/\\/g, '/')}            (${skippedBranchesNoName.length})`);
  out(`   ${path.join(OUT_DIR, 'skipped-branches-duplicates.csv').replace(/\\/g, '/')}         (${skippedBranchesDup.length})`);
  out(`   ${path.join(OUT_DIR, 'skipped-devices-no-branch-match.csv').replace(/\\/g, '/')}    (${skippedDevicesNoMatch.length})`);
  out(`   ${path.join(OUT_DIR, 'devices-broken-rate.csv').replace(/\\/g, '/')}                 (${devicesBrokenRate.length})`);
  out(`   ${path.join(OUT_DIR, 'devices-default-rate.csv').replace(/\\/g, '/')}                (${devicesDefaultRate.length})`);
  out();

  fs.writeFileSync(path.join(OUT_DIR, 'audit-summary.txt'), '﻿' + lines.join('\r\n'), 'utf8');
  console.log(`\n✓ סיכום נשמר ב-${path.join(OUT_DIR, 'audit-summary.txt')}`);
}

main().catch(err => { console.error('שגיאה:', err); process.exit(1); });
