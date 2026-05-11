require('dotenv').config();
const mongoose = require('mongoose');
const Device = require('../src/models/Device');

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const total = await Device.countDocuments({ isActive: true });
  const withNext = await Device.countDocuments({ isActive: true, nextScheduledRefill: { $exists: true, $ne: null } });
  const withLast = await Device.countDocuments({ isActive: true, lastRefillDate: { $exists: true, $ne: null } });
  const dueNow = await Device.countDocuments({
    isActive: true,
    nextScheduledRefill: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });

  console.log(`סה"כ מכשירים פעילים: ${total}`);
  console.log(`עם nextScheduledRefill:  ${withNext}`);
  console.log(`עם lastRefillDate:        ${withLast}`);
  console.log(`לפי השאילתה של "צור הצעה" (next ≤ +30 ימים): ${dueNow}`);

  // Sample 3
  const samples = await Device.find({ isActive: true }).limit(3).lean();
  console.log('\nדוגמאות:');
  samples.forEach(d => console.log(`  ${d.deviceType} | last=${d.lastRefillDate} | next=${d.nextScheduledRefill} | interval=${d.refillIntervalDays}`));

  await mongoose.disconnect();
}
main();
