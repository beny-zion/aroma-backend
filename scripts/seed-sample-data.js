/**
 * Seed Script: נתוני דוגמה למסד הנתונים
 *
 * יוצר נתוני דוגמה מלאים על בסיס מבנה האקסל של ארומה פלוס
 *
 * שימוש:
 * node scripts/seed-sample-data.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Customer, Branch, Device, Scent, DeviceType, ServiceLog } = require('../src/models');

// ========== נתוני דוגמה ==========

const DEVICE_TYPES = [
  { name: 'גדול', mlPerRefill: 400, defaultRefillInterval: 45, price: 150, stockQuantity: 20, description: 'מכשיר גדול סטנדרטי' },
  { name: 'אפליקציה', mlPerRefill: 200, defaultRefillInterval: 45, price: 120, stockQuantity: 15, description: 'מכשיר אפליקציה' },
  { name: 'מכשיליטר', mlPerRefill: 250, defaultRefillInterval: 30, price: 130, stockQuantity: 10, description: 'מכשיליטר' },
  { name: 'בינוני', mlPerRefill: 300, defaultRefillInterval: 45, price: 140, stockQuantity: 8, description: 'מכשיר בינוני' },
  { name: 'קטן בפנים', mlPerRefill: 150, defaultRefillInterval: 30, price: 100, stockQuantity: 12, description: 'מכשיר קטן פנימי' },
  { name: 'קטן', mlPerRefill: 150, defaultRefillInterval: 30, price: 90, stockQuantity: 10, description: 'מכשיר קטן' },
  { name: 'דנקיו', mlPerRefill: 200, defaultRefillInterval: 45, price: 110, stockQuantity: 5, description: 'מכשיר דנקיו' },
  { name: 'גדול הרניג 5', mlPerRefill: 400, defaultRefillInterval: 45, price: 160, stockQuantity: 3, description: 'מכשיר גדול הרניג דור 5' },
  { name: 'גדול הרניג 6', mlPerRefill: 400, defaultRefillInterval: 45, price: 170, stockQuantity: 3, description: 'מכשיר גדול הרניג דור 6' },
];

const SCENTS = [
  { name: 'פרפל', stockQuantity: 640, description: 'ריח פרפל קלאסי' },
  { name: 'חיים יפים', stockQuantity: 97672, description: 'ריח חיים יפים' },
  { name: 'קלואה', stockQuantity: 15000, description: 'ריח קלואה' },
  { name: 'אינויקטיס', stockQuantity: 14700, description: 'ריח אינויקטיס' },
  { name: 'גבריאל', stockQuantity: 149080, description: 'ריח גבריאל' },
  { name: 'ונילה פינק', stockQuantity: 5000, description: 'ריח ונילה פינק' },
  { name: 'בלו שנאל', stockQuantity: 3000, description: 'ריח בלו שנאל' },
  { name: 'ספא', stockQuantity: 8000, description: 'ריח ספא' },
  { name: 'גרין תה', stockQuantity: 4500, description: 'ריח גרין תה' },
  { name: 'רוד', stockQuantity: 2500, description: 'ריח רוד' },
];

const CUSTOMERS_DATA = [
  {
    customer: { name: 'מחסי עוז', monthlyPrice: 280, status: 'active' },
    branches: [
      {
        branchName: 'מרכז החושן - מבשרת ציון',
        address: 'הערבה 3 מבשרת',
        city: 'מבשרת ציון',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'ספא', locationInBranch: 'כניסה ראשית' },
          { deviceType: 'גדול', scent: 'בלו שנאל', locationInBranch: 'שירותים' },
        ]
      }
    ]
  },
  {
    customer: { name: 'מאור החיים', monthlyPrice: 420, status: 'active' },
    branches: [
      {
        branchName: 'מעון - קריית יערים (הדגן)',
        address: 'הדגן 7 טלזסטון',
        city: 'קריית יערים',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'פרפל', locationInBranch: 'לובי' },
          { deviceType: 'גדול', scent: 'פרפל', locationInBranch: 'קומה 2' },
        ]
      },
      {
        branchName: 'מעון - קריית יערים (חפץ חיים)',
        address: 'חפץ חיים',
        city: 'קריית יערים',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'ונילה פינק', locationInBranch: 'כניסה' },
        ]
      }
    ]
  },
  {
    customer: { name: 'רייצל H', monthlyPrice: 600, status: 'active' },
    branches: [
      {
        branchName: 'רייצל H - ירושלים - אזור רוממה',
        address: 'ירושלים',
        city: 'ירושלים',
        region: 'אזור רוממה',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'סנטר 1' },
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'למעלה' },
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'מחסן מינוס 1' },
        ]
      },
      {
        branchName: 'רייצל H - בני ברק',
        address: 'בני ברק',
        city: 'בני ברק',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'קומה 1' },
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'קומה 2' },
          { deviceType: 'אפליקציה', scent: 'חיים יפים', locationInBranch: 'קומה 3' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'מחסן' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'מחסן 2' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'מחסן 3' },
        ]
      },
      {
        branchName: 'רייצל H - בית שמש',
        address: 'מנחם פורוש',
        city: 'בית שמש',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'קומה 1' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'קומה 2' },
        ]
      }
    ]
  },
  {
    customer: { name: 'שמיז', monthlyPrice: 189, status: 'active' },
    branches: [
      {
        branchName: 'שמיז - ירושלים - אזור רוממה',
        address: 'סנטר 1',
        city: 'ירושלים',
        region: 'אזור רוממה',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'אפליקציה', scent: 'קלואה', locationInBranch: 'חנות' },
        ]
      },
      {
        branchName: 'שמיז - בני ברק',
        address: 'בני ברק',
        city: 'בני ברק',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'פרפל', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'פרפל', locationInBranch: 'קומה 2' },
        ]
      },
      {
        branchName: 'שמיז - בית שמש',
        address: 'בית שמש',
        city: 'בית שמש',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'קומה 1' },
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'קומה 2' },
        ]
      },
      {
        branchName: 'שמיז - ביתר',
        address: 'ביתר עילית',
        city: 'ביתר',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'קומה 1' },
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'קומה 2' },
          { deviceType: 'גדול', scent: 'קלואה', locationInBranch: 'שירותים' },
        ]
      }
    ]
  },
  {
    customer: { name: 'י.ש מרגוע', monthlyPrice: 1000, status: 'active' },
    branches: [
      {
        branchName: 'יד שרה - ירושלים - אזור רוממה',
        address: 'ירושלים',
        city: 'ירושלים',
        region: 'אזור רוממה',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'כניסה 2' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'ספא שירותים' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'מעליות' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'מסדרונות' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'אולם' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'מרכז השאלה' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'שירותים' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'קפיטריה' },
          { deviceType: 'גדול', scent: 'גבריאל', locationInBranch: 'קומות 5-12' },
        ]
      }
    ]
  },
  {
    customer: { name: 'טרגט מוטורס', monthlyPrice: 189, status: 'active' },
    branches: [
      {
        branchName: 'טרגט מוטורס - ירושלים - אזור רוממה',
        address: 'ירושלים',
        city: 'ירושלים',
        region: 'אזור רוממה',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'בלו שנאל', locationInBranch: 'אולם תצוגה' },
        ]
      }
    ]
  },
  {
    customer: { name: 'מוסדות אונסדורף', monthlyPrice: 149, status: 'pending' },
    branches: [
      {
        branchName: 'בית כנסת סורוצקין - ירושלים - אזור רוממה',
        address: 'סורוצקין',
        city: 'ירושלים',
        region: 'אזור רוממה',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'אפליקציה', scent: 'אינויקטיס', locationInBranch: 'בית כנסת' },
        ]
      }
    ]
  },
  {
    customer: { name: 'אאוטלט רהיטים', monthlyPrice: 280, status: 'active' },
    branches: [
      {
        branchName: 'אאוטלט רהיטים - בית שמש',
        address: 'בית שמש',
        city: 'בית שמש',
        region: '',
        visitIntervalDays: 30,
        devices: [
          { deviceType: 'גדול', scent: 'רוד', locationInBranch: 'כניסה' },
          { deviceType: 'גדול', scent: 'חיים יפים', locationInBranch: 'אולם' },
        ]
      }
    ]
  },
];

// ========== פונקציית Seed ==========

async function seed() {
  console.log('🚀 מתחיל יצירת נתוני דוגמה...\n');

  // התחברות
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ מחובר ל-MongoDB\n');
  } catch (err) {
    console.error('❌ שגיאה בהתחברות:', err.message);
    process.exit(1);
  }

  // ניקוי כל הנתונים הקיימים
  console.log('🗑️  מנקה נתונים קיימים...');
  await Customer.deleteMany({});
  await Branch.deleteMany({});
  await Device.deleteMany({});
  await Scent.deleteMany({});
  await DeviceType.deleteMany({});
  await ServiceLog.deleteMany({});
  console.log('  ✅ נוקה\n');

  // 1. סוגי מכשירים
  console.log('📦 יוצר סוגי מכשירים...');
  const deviceTypeMap = {};
  for (const dt of DEVICE_TYPES) {
    const created = await DeviceType.create(dt);
    deviceTypeMap[dt.name] = created._id;
  }
  console.log(`  ✅ ${DEVICE_TYPES.length} סוגי מכשירים\n`);

  // 2. ריחות
  console.log('🌸 יוצר ריחות...');
  const scentMap = {};
  for (const s of SCENTS) {
    const created = await Scent.create({ ...s, unit: 'ml', isActive: true });
    scentMap[s.name] = created._id;
  }
  console.log(`  ✅ ${SCENTS.length} ריחות\n`);

  // 3. לקוחות + סניפים + מכשירים
  console.log('👥 יוצר לקוחות, סניפים ומכשירים...');
  let totalCustomers = 0;
  let totalBranches = 0;
  let totalDevices = 0;
  const allDeviceIds = [];

  for (const data of CUSTOMERS_DATA) {
    // יצירת לקוח
    const customer = await Customer.create(data.customer);
    totalCustomers++;

    for (const branchData of data.branches) {
      const { devices, ...branchInfo } = branchData;

      // יצירת סניף
      const branch = await Branch.create({
        ...branchInfo,
        customerId: customer._id,
        isActive: true,
      });
      totalBranches++;

      // יצירת מכשירים
      for (const dev of devices) {
        const dtEntry = DEVICE_TYPES.find(d => d.name === dev.deviceType);
        const device = await Device.create({
          branchId: branch._id,
          deviceType: dev.deviceType,
          scentId: scentMap[dev.scent] || null,
          locationInBranch: dev.locationInBranch,
          mlPerRefill: dtEntry ? dtEntry.mlPerRefill : 100,
          refillIntervalDays: 30,
          isActive: true,
        });
        allDeviceIds.push(device._id);
        totalDevices++;
      }
    }
  }
  console.log(`  ✅ ${totalCustomers} לקוחות`);
  console.log(`  ✅ ${totalBranches} סניפים`);
  console.log(`  ✅ ${totalDevices} מכשירים\n`);

  // 4. רשומות שירות לדוגמה (היסטוריית מילויים)
  console.log('📋 יוצר רשומות שירות לדוגמה...');
  let totalLogs = 0;
  const now = new Date();

  for (const deviceId of allDeviceIds) {
    const device = await Device.findById(deviceId);
    if (!device) continue;

    // יצירת 2-3 רשומות שירות לכל מכשיר
    const numLogs = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numLogs; i++) {
      const daysAgo = (i + 1) * 30 + Math.floor(Math.random() * 10);
      const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      await ServiceLog.create({
        deviceId: device._id,
        date,
        mlFilled: device.mlPerRefill,
        scentId: device.scentId,
        serviceType: 'refill',
        technicianName: 'טכנאי דוגמה',
        technicianNotes: `מילוי שגרתי - ${device.locationInBranch}`,
      });
      totalLogs++;
    }

    // עדכון תאריך מילוי אחרון
    await Device.findByIdAndUpdate(deviceId, {
      lastRefillDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
    });
  }
  console.log(`  ✅ ${totalLogs} רשומות שירות\n`);

  // סיכום
  console.log('========================================');
  console.log('✅ נתוני הדוגמה נוצרו בהצלחה!');
  console.log('========================================');
  console.log(`📊 סיכום:`);
  console.log(`   סוגי מכשירים: ${await DeviceType.countDocuments()}`);
  console.log(`   ריחות:        ${await Scent.countDocuments()}`);
  console.log(`   לקוחות:       ${await Customer.countDocuments()}`);
  console.log(`   סניפים:       ${await Branch.countDocuments()}`);
  console.log(`   מכשירים:      ${await Device.countDocuments()}`);
  console.log(`   רשומות שירות: ${await ServiceLog.countDocuments()}`);
  console.log('========================================\n');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ שגיאה:', err);
  process.exit(1);
});
