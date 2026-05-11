/**
 * Diagnostic: list every technician + how many WOs are currently assigned to them.
 * Read-only.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { User, WorkOrder } = require('../src/models');

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const technicians = await User.find({ role: 'technician' }).select('name email').lean();
  console.log(`טכנאים במערכת: ${technicians.length}\n`);

  for (const t of technicians) {
    const counts = await WorkOrder.aggregate([
      { $match: { assignedTo: t._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const total = counts.reduce((s, c) => s + c.count, 0);
    console.log(`${t.name} (${t.email})  →  ${total} הזמנות עבודה`);
    counts.forEach(c => console.log(`    • ${c._id}: ${c.count}`));

    // Show 3 most recent assignments
    const recent = await WorkOrder.find({ assignedTo: t._id })
      .sort({ scheduledDate: 1 })
      .limit(3)
      .populate('branchId', 'branchName city')
      .lean();
    if (recent.length) {
      console.log('    דוגמאות:');
      recent.forEach(wo => {
        const d = new Date(wo.scheduledDate).toLocaleDateString('he-IL');
        console.log(`      ${d}  ${wo.branchId?.branchName || '?'}/${wo.branchId?.city || ''}  [${wo.status}]`);
      });
    }
    console.log();
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
