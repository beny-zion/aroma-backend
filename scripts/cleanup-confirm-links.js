/**
 * Strip "קישור אישור: ..." prefix from all branch notes.
 * The link was added during CSV import but is no longer relevant.
 *
 * Usage:
 *   node scripts/cleanup-confirm-links.js --dry-run
 *   node scripts/cleanup-confirm-links.js --write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../src/models/Branch');

const DRY_RUN = !process.argv.includes('--write');

function clean(notes) {
  if (!notes) return notes;
  // Remove "קישור אישור: <url>" — possibly with " | " before/after
  let s = notes
    .replace(/(^|\s\|\s)קישור אישור:\s*\S+/g, '')
    .replace(/^\s*\|\s*/, '')
    .replace(/\s*\|\s*$/, '')
    .trim();
  return s || undefined;
}

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const branches = await Branch.find({ notes: /קישור אישור/ }).lean();
  console.log(`נמצאו ${branches.length} סניפים עם "קישור אישור" בהערות.`);

  let willClear = 0, willTrim = 0;
  for (const b of branches.slice(0, 5)) {
    const cleaned = clean(b.notes);
    console.log(`\n--- ${b.branchName} ---`);
    console.log(`לפני:   ${b.notes}`);
    console.log(`אחרי:   ${cleaned ?? '(ריק)'}`);
  }

  for (const b of branches) {
    const cleaned = clean(b.notes);
    if (!cleaned) willClear++; else willTrim++;
  }
  console.log(`\nסה"כ: ${willClear} סניפים יישארו ללא הערה, ${willTrim} יישאר רק החלק האחר`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — לא נשמר כלום. להרצה: --write');
    await mongoose.disconnect();
    return;
  }

  console.log('\n💾 כותב לDB...');
  let updated = 0;
  for (const b of branches) {
    const cleaned = clean(b.notes);
    await Branch.updateOne({ _id: b._id }, { $set: { notes: cleaned ?? '' } });
    updated++;
    if (updated % 50 === 0) console.log(`  ${updated}/${branches.length}...`);
  }
  console.log(`✅ ${updated} סניפים עודכנו.`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
