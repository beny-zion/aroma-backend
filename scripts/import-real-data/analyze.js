/**
 * Analyze raw CSV data — produce a diagnostic report.
 * No DB writes. Uses 3 CSV files:
 *   - customers (payers)
 *   - branches (businesses)
 *   - devices (per-device with rate, type, scent, location)
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATA_DIR = 'C:/Users/user/ארומה מידע';
const BRANCHES_FILE = path.join(DATA_DIR, 'בתי העסק-כל הלקוחות (2).csv');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'עיסקאות_ שם המשלם-ראשי.csv');
const DEVICES_FILE = path.join(DATA_DIR, 'פרוט המכשירים-כל המכשירים.csv');

function readCsv(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true, bom: true });
}

function norm(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

function parsePrice(cell) {
  if (!cell) return null;
  const cleaned = String(cell).replace(/₪|,|\s/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (n > 50000) return null;
  return n;
}

function parseDeviceRate(cell) {
  // "150" → 150, "2*150,120" → 420 (2*150 + 120), "" → null
  if (!cell) return null;
  const s = String(cell).replace(/₪|\s/g, '');
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  // Handle "n*p,n*p,..." pattern
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

const branchesRaw = readCsv(BRANCHES_FILE);
const customersRaw = readCsv(CUSTOMERS_FILE);
const devicesRaw = readCsv(DEVICES_FILE);

console.log('================================================================');
console.log('  AROMA PLUS — CSV DIAGNOSTIC REPORT');
console.log('================================================================');
console.log();
console.log(`לקוחות:   ${customersRaw.length} שורות`);
console.log(`סניפים:   ${branchesRaw.length} שורות`);
console.log(`מכשירים:  ${devicesRaw.length} שורות`);
console.log();

// === Customers ===
console.log('--- לקוחות (משלמים) ---');
const custByName = new Map();
const custIssues = { dup: [], emptyName: 0, badPrice: [] };
for (const row of customersRaw) {
  const name = norm(row['שם המשלם']);
  if (!name) { custIssues.emptyName++; continue; }
  if (custByName.has(name)) custIssues.dup.push(name);
  else custByName.set(name, row);

  const before = parsePrice(row['מחיר חודשי לפני מע"מ']);
  const rawBefore = row['מחיר חודשי לפני מע"מ'];
  if (rawBefore && before === null) custIssues.badPrice.push({ name, raw: rawBefore });
}
console.log(`  ייחודיים: ${custByName.size}, שמות ריקים: ${custIssues.emptyName}, כפילויות: ${custIssues.dup.length}, מחירים שבורים: ${custIssues.badPrice.length}`);
console.log();

// === Branches ===
console.log('--- סניפים ---');
const branchKey = (name, city, region) => `${norm(name)}::${norm(city)}::${norm(region)}`;
const branchByKey = new Map();
const branchIssues = { dup: [], emptyName: 0, emptyCity: 0, noPayer: 0, unknownPayer: [] };
for (const row of branchesRaw) {
  const business = norm(row['בית העסק']);
  const city = norm(row['עיר']);
  const region = norm(row['אזור']);
  const payer = norm(row['עיסקאות/ שם המשלם']).replace(/^"|"$/g, '').replace(/""/g, '"').trim();

  if (!business) branchIssues.emptyName++;
  if (!city) branchIssues.emptyCity++;
  if (!payer) branchIssues.noPayer++;
  else if (!custByName.has(payer)) branchIssues.unknownPayer.push({ business, city, payer });

  const k = branchKey(business, city, region);
  if (branchByKey.has(k)) branchIssues.dup.push(k);
  else branchByKey.set(k, row);
}
console.log(`  ייחודיים (שם+עיר+אזור): ${branchByKey.size}`);
console.log(`  שמות ריקים: ${branchIssues.emptyName}, ערים ריקות: ${branchIssues.emptyCity}, ללא משלם: ${branchIssues.noPayer}, משלם לא קיים: ${branchIssues.unknownPayer.length}, כפילויות: ${branchIssues.dup.length}`);
if (branchIssues.unknownPayer.length) {
  console.log('  → משלם לא נמצא:');
  branchIssues.unknownPayer.slice(0, 8).forEach(u => console.log(`    "${u.business}" / ${u.city} → payer="${u.payer}"`));
}
console.log();

// === Devices (from CSV 3) ===
console.log('--- מכשירים (קובץ 3) ---');
const deviceTypes = new Map();
const deviceIssues = {
  emptyBranch: 0,
  unknownBranch: [],
  emptyType: 0,
  unknownPayer: [],
  noRate: 0,
  badRate: [],
  emptyScent: 0,
};
const ratesByType = {};   // type → { count, sum, min, max, samples }
// Match devices to branches by FULL name. Branches CSV "שם הלקוח" column already has the combined "Business - city - region" form.
const branchSetFromBranchesFile = new Set();
for (const row of branchesRaw) {
  branchSetFromBranchesFile.add(norm(row['שם הלקוח']));
  branchSetFromBranchesFile.add(norm(row['בית העסק'])); // also accept short name
}

let devicesByBranch = new Map(); // branchName → count
for (const row of devicesRaw) {
  const branchName = norm(row['בית העסק']);
  const type = norm(row['סוג המכשיר']);
  const scent = norm(row['הריחות']);
  const payer = norm(row['עיסקאות/ שם המשלם']).replace(/^"|"$/g, '').replace(/""/g, '"').trim();
  const rateRaw = row['תעריף'];
  const rate = parseDeviceRate(rateRaw);

  if (!branchName) deviceIssues.emptyBranch++;
  else if (!branchSetFromBranchesFile.has(branchName)) deviceIssues.unknownBranch.push(branchName);

  if (!type) deviceIssues.emptyType++;
  if (!scent) deviceIssues.emptyScent++;
  if (payer && !custByName.has(payer)) deviceIssues.unknownPayer.push(payer);

  const tKey = type || '(ריק)';
  deviceTypes.set(tKey, (deviceTypes.get(tKey) || 0) + 1);

  if (!rateRaw || !String(rateRaw).trim()) {
    deviceIssues.noRate++;
  } else if (rate === null) {
    deviceIssues.badRate.push({ branch: branchName, raw: rateRaw });
  } else {
    if (!ratesByType[tKey]) ratesByType[tKey] = { count: 0, sum: 0, min: Infinity, max: 0, samples: [] };
    ratesByType[tKey].count++;
    ratesByType[tKey].sum += rate;
    ratesByType[tKey].min = Math.min(ratesByType[tKey].min, rate);
    ratesByType[tKey].max = Math.max(ratesByType[tKey].max, rate);
    if (ratesByType[tKey].samples.length < 5) ratesByType[tKey].samples.push(rate);
  }

  if (branchName) devicesByBranch.set(branchName, (devicesByBranch.get(branchName) || 0) + 1);
}

console.log(`  סה"כ: ${devicesRaw.length}`);
console.log(`  ללא בית עסק: ${deviceIssues.emptyBranch}`);
console.log(`  בית עסק שלא מופיע בקובץ הסניפים: ${new Set(deviceIssues.unknownBranch).size} (${deviceIssues.unknownBranch.length} מופעים)`);
console.log(`  ללא סוג: ${deviceIssues.emptyType}`);
console.log(`  ללא ריח: ${deviceIssues.emptyScent}`);
console.log(`  משלם לא בקובץ הלקוחות: ${new Set(deviceIssues.unknownPayer).size}`);
console.log(`  ללא תעריף: ${deviceIssues.noRate}`);
console.log(`  תעריף שלא נפרסר: ${deviceIssues.badRate.length}`);
deviceIssues.badRate.slice(0, 5).forEach(b => console.log(`    → "${b.branch}": ${b.raw}`));
console.log();

console.log('  פילוח סוגי מכשיר:');
[...deviceTypes.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`    ${t}: ${n}`));
console.log();

console.log('  תעריפים ממוצעים לפי סוג (מתוך אלה שיש להם תעריף):');
for (const [t, s] of Object.entries(ratesByType).sort((a, b) => b[1].count - a[1].count)) {
  const avg = (s.sum / s.count).toFixed(0);
  console.log(`    ${t.padEnd(20)} avg=${avg}, min=${s.min}, max=${s.max}, n=${s.count} (${[...new Set(s.samples)].slice(0, 3).join(',')})`);
}
console.log();

console.log('================================================================');
console.log('סיום דוח.');
console.log('================================================================');
