/**
 * Migration Script: Excel (Airtable Export) to MongoDB
 *
 * מייבא את כל הנתונים מקובץ ה-Excel של ארומה פלוס
 *
 * שימוש:
 * node scripts/migrate-from-excel.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');

const { Customer, Branch, Device, Scent, ServiceLog } = require('../src/models');

// נתיב לקובץ Excel
const EXCEL_PATH = path.join(__dirname, '..', '..', 'ארומה פלוס.xlsx');

// המרת תאריך Excel לתאריך JavaScript
function excelDateToJS(excelDate) {
  if (!excelDate || typeof excelDate !== 'number') return null;
  // Excel dates start from 1899-12-30
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * פירסור שדה מכשיר מורכב
 * פורמט: "שם לקוח - עיר - אזור | סוג מכשיר ריח | מיקום"
 */
function parseDeviceString(deviceStr) {
  if (!deviceStr || typeof deviceStr !== 'string') return null;

  const parts = deviceStr.split('|').map(p => p.trim());
  if (parts.length < 2) return null;

  // חלק ראשון: שם לקוח - עיר - אזור
  const locationPart = parts[0];

  // חלק שני: סוג מכשיר + ריח
  const devicePart = parts[1];

  // חלק שלישי (אופציונלי): מיקום בסניף
  const locationInBranch = parts[2] || '';

  // פירסור סוג המכשיר והריח
  // דוגמאות: "גדול* פרפל", "אפליקציה חיים יפים", "קטן בבפנים גרין תה"
  const deviceTypes = ['גדול\\*', 'גדול', 'קטן', 'אפליקציה', 'טאבלט', 'מכשיליטר', 'hearing 5', 'דנקיו', 'מיני'];
  const deviceTypeRegex = new RegExp(`^(${deviceTypes.join('|')})\\s*(.*)$`, 'i');

  const match = devicePart.match(deviceTypeRegex);
  let deviceType = 'לא ידוע';
  let scentName = '';

  if (match) {
    deviceType = match[1].replace('*', '').trim();
    scentName = match[2].trim();
  } else {
    // אם לא מצאנו התאמה, כל הטקסט הוא שם הריח
    scentName = devicePart;
  }

  return {
    fullString: deviceStr,
    locationPart,
    deviceType,
    scentName,
    locationInBranch
  };
}

/**
 * פירסור שם לקוח מורכב
 * פורמט: "שם - עיר - אזור"
 */
function parseCustomerLocation(locationStr) {
  if (!locationStr) return { name: '', city: '', region: '' };

  const parts = locationStr.split(' - ').map(p => p.trim());

  return {
    name: parts[0] || '',
    city: parts[1] || '',
    region: parts[2] || ''
  };
}

// ========== Main Migration Functions ==========

async function migrateScents(workbook) {
  console.log('\n📦 מייבא ריחות...');

  const sheet = workbook.Sheets['הריחות'];
  if (!sheet) {
    console.log('⚠️ גיליון הריחות לא נמצא');
    return new Map();
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const scentMap = new Map();
  let count = 0;

  // מתחילים משורה 4 (אחרי כותרות)
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const name = String(row[0]).trim();
    const stockQuantity = parseInt(row[1]) || 0;

    if (!name || name === 'View in Airtable') continue;

    try {
      let scent = await Scent.findOne({ name });
      if (!scent) {
        scent = await Scent.create({
          name,
          stockQuantity,
          unit: 'ml',
          isActive: true
        });
        count++;
      }
      scentMap.set(name, scent._id);
    } catch (err) {
      console.error(`  שגיאה בריח "${name}":`, err.message);
    }
  }

  console.log(`  ✅ נוצרו ${count} ריחות`);
  return scentMap;
}

async function migrateCustomersAndBranches(workbook) {
  console.log('\n👥 מייבא לקוחות וסניפים...');

  const sheet = workbook.Sheets['בתי עסק'];
  if (!sheet) {
    console.log('⚠️ גיליון בתי עסק לא נמצא');
    return { customerMap: new Map(), branchMap: new Map() };
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const customerMap = new Map();
  const branchMap = new Map();
  let customerCount = 0;
  let branchCount = 0;

  // מתחילים משורה 4
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const fullName = String(row[0]).trim(); // שם הלקוח המלא (כולל עיר ואזור)
    const businessName = String(row[3] || '').trim(); // שם בית העסק
    const city = String(row[4] || '').trim();
    const region = String(row[5] || '').trim();
    const address = String(row[6] || '').trim();
    const firstInstallDate = excelDateToJS(row[7]);
    const lastVisitDate = excelDateToJS(row[8]);
    const visitInterval = parseInt(row[14]) || 30;
    const payerName = String(row[13] || '').trim(); // שם המשלם

    if (!fullName || fullName === 'View in Airtable') continue;

    try {
      // יצירת/שליפת לקוח (לפי שם המשלם או שם בית העסק)
      const customerName = payerName || businessName || fullName.split(' - ')[0];

      let customer = await Customer.findOne({ name: customerName });
      if (!customer) {
        customer = await Customer.create({
          name: customerName,
          status: 'active'
        });
        customerCount++;
      }
      customerMap.set(customerName, customer._id);

      // יצירת סניף
      const branchName = fullName; // השם המלא כשם הסניף
      let branch = await Branch.findOne({
        customerId: customer._id,
        branchName
      });

      if (!branch) {
        branch = await Branch.create({
          customerId: customer._id,
          branchName,
          address,
          city,
          region,
          visitIntervalDays: visitInterval,
          isActive: true
        });
        branchCount++;
      }
      branchMap.set(fullName, branch._id);

    } catch (err) {
      console.error(`  שגיאה בלקוח "${fullName}":`, err.message);
    }
  }

  console.log(`  ✅ נוצרו ${customerCount} לקוחות`);
  console.log(`  ✅ נוצרו ${branchCount} סניפים`);

  return { customerMap, branchMap };
}

async function migrateDevices(workbook, scentMap, branchMap) {
  console.log('\n📱 מייבא מכשירים...');

  const sheet = workbook.Sheets['פירוט מכשירים'];
  if (!sheet) {
    console.log('⚠️ גיליון פירוט מכשירים לא נמצא');
    return new Map();
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const deviceMap = new Map();
  let count = 0;

  // מתחילים משורה 4
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const deviceId = String(row[0]).trim(); // זיהוי המכשירים
    const deviceName = String(row[1] || '').trim();
    const isActive = row[2] !== false && row[2] !== 0;
    const businessName = String(row[4] || '').trim(); // בית העסק
    const deviceType = String(row[5] || 'לא ידוע').trim();
    const scentName = String(row[6] || '').trim();
    const mlCurrent = parseInt(row[8]) || 0;
    const mlUsual = parseInt(row[9]) || 100;
    const locationInBranch = String(row[10] || '').trim();

    if (!deviceId || deviceId === 'View in Airtable') continue;

    try {
      // מציאת הסניף
      let branchId = branchMap.get(businessName);

      // אם לא מצאנו, ננסה ליצור סניף חדש
      if (!branchId && businessName) {
        const parsed = parseCustomerLocation(businessName);

        // יצירת לקוח אם לא קיים
        let customer = await Customer.findOne({ name: parsed.name });
        if (!customer && parsed.name) {
          customer = await Customer.create({
            name: parsed.name,
            status: 'active'
          });
        }

        if (customer) {
          const branch = await Branch.create({
            customerId: customer._id,
            branchName: businessName,
            city: parsed.city,
            region: parsed.region,
            isActive: true
          });
          branchId = branch._id;
          branchMap.set(businessName, branchId);
        }
      }

      if (!branchId) {
        console.log(`  ⚠️ לא נמצא סניף למכשיר: ${deviceId}`);
        continue;
      }

      // מציאת הריח
      const scentId = scentMap.get(scentName) || null;

      // יצירת המכשיר
      const device = await Device.create({
        branchId,
        deviceType: deviceType.replace('*', '').trim(),
        scentId,
        locationInBranch,
        mlPerRefill: mlUsual,
        isActive,
        notes: `מזהה מקורי: ${deviceId}`
      });

      deviceMap.set(deviceId, device._id);
      count++;

    } catch (err) {
      console.error(`  שגיאה במכשיר "${deviceId}":`, err.message);
    }
  }

  console.log(`  ✅ נוצרו ${count} מכשירים`);
  return deviceMap;
}

async function migrateServiceHistory(workbook, deviceMap, scentMap) {
  console.log('\n📋 מייבא היסטוריית מילויים...');

  const sheet = workbook.Sheets['היסטורית מכשירים'];
  if (!sheet) {
    console.log('⚠️ גיליון היסטורית מכשירים לא נמצא');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let count = 0;

  // מתחילים משורה 4
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const date = excelDateToJS(row[0]);
    const deviceIdentifier = String(row[2] || '').trim(); // פרוט המכשירים
    const mlFilled = parseInt(row[3]) || 0;
    const notes = String(row[5] || '').trim();
    const changeDescription = String(row[7] || '').trim();

    if (!date || !deviceIdentifier) continue;

    try {
      // מציאת המכשיר
      let deviceId = deviceMap.get(deviceIdentifier);

      // אם לא מצאנו, ננסה לחפש לפי חלק מהשם
      if (!deviceId) {
        for (const [key, value] of deviceMap.entries()) {
          if (key.includes(deviceIdentifier) || deviceIdentifier.includes(key)) {
            deviceId = value;
            break;
          }
        }
      }

      if (!deviceId) {
        // ננסה למצוא את המכשיר ב-DB
        const device = await Device.findOne({
          notes: { $regex: deviceIdentifier.substring(0, 30), $options: 'i' }
        });
        if (device) deviceId = device._id;
      }

      if (!deviceId) {
        continue; // דילוג אם לא מצאנו
      }

      // יצירת רשומת שירות
      await ServiceLog.create({
        deviceId,
        date,
        mlFilled,
        serviceType: 'refill',
        technicianNotes: `${changeDescription}${notes ? ' - ' + notes : ''}`
      });

      // עדכון תאריך מילוי אחרון במכשיר
      await Device.findByIdAndUpdate(deviceId, {
        lastRefillDate: date
      });

      count++;

    } catch (err) {
      // שגיאות כפילות - מתעלמים
      if (!err.message.includes('duplicate')) {
        console.error(`  שגיאה ברשומת היסטוריה:`, err.message);
      }
    }
  }

  console.log(`  ✅ נוצרו ${count} רשומות היסטוריה`);
}

async function updatePayerInfo(workbook, customerMap) {
  console.log('\n💰 מעדכן פרטי משלמים...');

  const sheet = workbook.Sheets['עיסקאות שם המשלם'];
  if (!sheet) {
    console.log('⚠️ גיליון עיסקאות לא נמצא');
    return;
  }

  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  let count = 0;

  // מתחילים משורה 4
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const payerName = String(row[0]).trim();
    const monthlyPrice = parseFloat(row[6]) || 0;
    const status = String(row[5] || '').trim();

    if (!payerName || payerName === 'View in Airtable') continue;

    try {
      const customer = await Customer.findOne({ name: payerName });
      if (customer) {
        customer.monthlyPrice = monthlyPrice;
        customer.status = status === 'פעיל' ? 'active' :
                         status === 'בתהליך' ? 'pending' : 'active';
        await customer.save();
        count++;
      }
    } catch (err) {
      console.error(`  שגיאה בעדכון משלם "${payerName}":`, err.message);
    }
  }

  console.log(`  ✅ עודכנו ${count} לקוחות עם פרטי תשלום`);
}

// ========== Main ==========

async function main() {
  console.log('🚀 מתחיל מיגרציה מ-Excel ל-MongoDB...\n');

  // טעינת קובץ Excel
  let workbook;
  try {
    workbook = XLSX.readFile(EXCEL_PATH);
    console.log('✅ קובץ Excel נטען בהצלחה');
    console.log(`   גיליונות: ${workbook.SheetNames.join(', ')}`);
  } catch (err) {
    console.error('❌ שגיאה בטעינת קובץ Excel:', err.message);
    process.exit(1);
  }

  // התחברות ל-MongoDB
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ מחובר ל-MongoDB');
  } catch (err) {
    console.error('❌ שגיאה בהתחברות ל-MongoDB:', err.message);
    process.exit(1);
  }

  // ניקוי נתונים קיימים (אופציונלי)
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    rl.question('\n⚠️ האם למחוק את כל הנתונים הקיימים? (y/N): ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() === 'y') {
    console.log('\n🗑️ מוחק נתונים קיימים...');
    await Customer.deleteMany({});
    await Branch.deleteMany({});
    await Device.deleteMany({});
    await Scent.deleteMany({});
    await ServiceLog.deleteMany({});
    console.log('  ✅ כל הנתונים נמחקו');
  }

  // הרצת המיגרציה
  const scentMap = await migrateScents(workbook);
  const { customerMap, branchMap } = await migrateCustomersAndBranches(workbook);
  const deviceMap = await migrateDevices(workbook, scentMap, branchMap);
  await migrateServiceHistory(workbook, deviceMap, scentMap);
  await updatePayerInfo(workbook, customerMap);

  // סיכום
  const stats = {
    customers: await Customer.countDocuments(),
    branches: await Branch.countDocuments(),
    devices: await Device.countDocuments(),
    scents: await Scent.countDocuments(),
    serviceLogs: await ServiceLog.countDocuments()
  };

  console.log('\n========================================');
  console.log('✅ המיגרציה הושלמה בהצלחה!');
  console.log('========================================');
  console.log(`📊 סיכום:`);
  console.log(`   לקוחות: ${stats.customers}`);
  console.log(`   סניפים: ${stats.branches}`);
  console.log(`   מכשירים: ${stats.devices}`);
  console.log(`   ריחות: ${stats.scents}`);
  console.log(`   רשומות שירות: ${stats.serviceLogs}`);
  console.log('========================================\n');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ שגיאה קריטית:', err);
  process.exit(1);
});
