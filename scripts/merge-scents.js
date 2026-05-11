/**
 * Merge duplicate/compound scents into canonical ones.
 *
 *   1) Find the source and target scents by name
 *   2) Reassign every Device.scentId from source → target
 *   3) Delete the source scent
 *   4) Write an audit log entry per merge so we can trace what happened
 *
 * Usage:
 *   node scripts/merge-scents.js --dry-run
 *   node scripts/merge-scents.js --write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { Scent, Device, AuditLog } = require('../src/models');

const DRY_RUN = !process.argv.includes('--write');

// [sourceName, targetName] — exact names as stored in DB.
const MERGES = [
  ['רויאל ביץ',                'רויאל'],
  ['פרפל פתאל יסמין ובראשית',  'פרפל'],
  ['כרמים/גרין תה',            'כרמים'],
  ['ספא וקליר',                 'ספא'],
  ['בוטיק ופרש תה',            'בוטיק'],
  ['כביסה ודאב',                'כביסה'],
  ['איוניקטוס ופתאל',          'אינויקטיס'],
  ['ונילה פינק פפר',           'ונילה פינק'],
];

async function findScent(name) {
  // tolerate trailing/leading whitespace
  const exact = await Scent.findOne({ name });
  if (exact) return exact;
  const fuzzy = await Scent.findOne({ name: { $regex: `^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$` } });
  return fuzzy;
}

async function main() {
  const dns = require('dns');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'WRITE'}\n`);

  let totalReassigned = 0;
  let totalDeleted = 0;

  for (const [sourceName, targetName] of MERGES) {
    const source = await findScent(sourceName);
    const target = await findScent(targetName);

    if (!source) {
      console.log(`⚠️  "${sourceName}" לא קיים — מדלגת`);
      continue;
    }
    if (!target) {
      console.log(`❌ "${targetName}" לא קיים — לא יכולה למזג את "${sourceName}"`);
      continue;
    }
    if (source._id.equals(target._id)) {
      console.log(`⚠️  "${sourceName}" === "${targetName}" — מדלגת`);
      continue;
    }

    const affectedDevices = await Device.countDocuments({ scentId: source._id });
    console.log(`  "${sourceName}" → "${targetName}"  (${affectedDevices} מכשירים)`);

    if (!DRY_RUN) {
      await Device.updateMany({ scentId: source._id }, { $set: { scentId: target._id } });
      await Scent.deleteOne({ _id: source._id });
      // Audit trail
      await AuditLog.create({
        entityType: 'device',
        entityId: target._id,
        entityName: targetName,
        action: 'update',
        changes: [{ field: 'scent_merge', from: sourceName, to: targetName }],
        userName: 'מערכת',
        userRole: 'admin',
        notes: `מיזוג ריחות — ${affectedDevices} מכשירים הועברו מ"${sourceName}" אל "${targetName}"`
      });
    }
    totalReassigned += affectedDevices;
    totalDeleted += 1;
  }

  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`סיכום: ${totalDeleted} ריחות נמחקו, ${totalReassigned} מכשירים הועברו`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — כלום לא שונה. להרצה אמיתית: --write');
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
