/**
 * Backfill nextScheduledRefill for devices that don't have one.
 * After CSV import, most devices have no refill history, so the schedule
 * "צור הצעה" returns empty. This sets next refill = today for all such
 * devices, so the scheduler will see them as "needs scheduling".
 *
 * Usage:
 *   node scripts/backfill-refill-dates.js --dry-run
 *   node scripts/backfill-refill-dates.js --write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../src/models/Device');

const DRY_RUN = !process.argv.includes('--write');

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const noNext = await Device.countDocuments({
    isActive: true,
    $or: [
      { nextScheduledRefill: { $exists: false } },
      { nextScheduledRefill: null }
    ]
  });
  console.log(`מכשירים פעילים ללא nextScheduledRefill: ${noNext}`);

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN — יעדכן ${noNext} מכשירים ל-nextScheduledRefill=${today.toISOString().slice(0, 10)}`);
    console.log('להרצה אמיתית: --write');
    await mongoose.disconnect();
    return;
  }

  const result = await Device.updateMany(
    {
      isActive: true,
      $or: [
        { nextScheduledRefill: { $exists: false } },
        { nextScheduledRefill: null }
      ]
    },
    { $set: { nextScheduledRefill: today } }
  );
  console.log(`✅ עודכנו ${result.modifiedCount} מכשירים.`);

  await mongoose.disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
