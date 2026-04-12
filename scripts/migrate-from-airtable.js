/**
 * Migration Script: Airtable CSV to MongoDB
 *
 * שימוש:
 * 1. ייצא את הנתונים מ-Airtable כ-CSV
 * 2. שמור את הקובץ כ 'airtable-export.csv' בתיקיית scripts
 * 3. הרץ: npm run migrate
 *
 * הסקריפט מפרסר את השדות המורכבים מ-Airtable ומפצל אותם
 * לטבלאות נפרדות ב-MongoDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const { Customer, Branch, Device, Scent } = require('../src/models');

// פונקציה לפירסור שורת CSV
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * פירסור שדה מכשירים מ-Airtable
 * דוגמה: "גדול* ספא, קטן* לובי, אפליקציה* קומה 2"
 * התוצאה: [{deviceType: "גדול", locationInBranch: "ספא"}, ...]
 */
function parseDevicesField(devicesText) {
  if (!devicesText || devicesText.trim() === '') return [];

  const devices = [];
  // פיצול לפי פסיק
  const parts = devicesText.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // ניסיון לפרסר עם *
    if (trimmed.includes('*')) {
      const [type, location] = trimmed.split('*').map(s => s.trim());
      devices.push({
        deviceType: type || 'לא ידוע',
        locationInBranch: location || ''
      });
    } else {
      // אם אין *, כל הטקסט הוא סוג המכשיר
      devices.push({
        deviceType: trimmed,
        locationInBranch: ''
      });
    }
  }

  return devices;
}

/**
 * פונקציה ראשית למיגרציה
 */
async function migrate() {
  const csvPath = path.join(__dirname, 'airtable-export.csv');

  // בדיקה שקובץ ה-CSV קיים
  if (!fs.existsSync(csvPath)) {
    console.log('======================================');
    console.log('לא נמצא קובץ airtable-export.csv');
    console.log('');
    console.log('הוראות:');
    console.log('1. ייצא את הנתונים מ-Airtable');
    console.log('2. שמור כ-CSV בשם airtable-export.csv');
    console.log('3. העבר לתיקיית scripts');
    console.log('4. הרץ שוב: npm run migrate');
    console.log('======================================');
    process.exit(1);
  }

  // התחברות ל-MongoDB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // קריאת ה-CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    console.log('קובץ ה-CSV ריק או חסרות שורות');
    process.exit(1);
  }

  // הכותרות (שורה ראשונה)
  const headers = parseCSVLine(lines[0]);
  console.log('Headers found:', headers);

  // מיפוי אינדקסים - התאם לפי הכותרות בקובץ שלך
  const headerMap = {};
  headers.forEach((header, index) => {
    headerMap[header.toLowerCase().trim()] = index;
  });

  // מטמון ריחות
  const scentCache = new Map();

  // סטטיסטיקות
  const stats = {
    customers: 0,
    branches: 0,
    devices: 0,
    scents: 0
  };

  // עיבוד כל שורה
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 3) continue; // שורה לא תקינה

    try {
      // חילוץ נתונים - התאם את השמות לכותרות בקובץ שלך
      const customerName = values[headerMap['שם לקוח'] || headerMap['customer'] || 0] || '';
      const branchName = values[headerMap['סניף'] || headerMap['branch'] || 1] || customerName;
      const address = values[headerMap['כתובת'] || headerMap['address'] || 2] || '';
      const city = values[headerMap['עיר'] || headerMap['city'] || 3] || '';
      const devicesText = values[headerMap['מכשירים'] || headerMap['devices'] || 4] || '';
      const scentName = values[headerMap['ריח'] || headerMap['scent'] || 5] || '';
      const lastRefillText = values[headerMap['מילוי אחרון'] || headerMap['last refill'] || 6] || '';

      if (!customerName) continue;

      // יצירת/שליפת לקוח
      let customer = await Customer.findOne({ name: customerName });
      if (!customer) {
        customer = await Customer.create({
          name: customerName,
          status: 'active'
        });
        stats.customers++;
        console.log(`Created customer: ${customerName}`);
      }

      // יצירת/שליפת סניף
      let branch = await Branch.findOne({
        customerId: customer._id,
        branchName: branchName
      });
      if (!branch) {
        branch = await Branch.create({
          customerId: customer._id,
          branchName: branchName,
          address: address,
          city: city
        });
        stats.branches++;
        console.log(`  Created branch: ${branchName}`);
      }

      // יצירת/שליפת ריח
      let scent = null;
      if (scentName && scentName.trim()) {
        if (scentCache.has(scentName)) {
          scent = scentCache.get(scentName);
        } else {
          scent = await Scent.findOne({ name: scentName });
          if (!scent) {
            scent = await Scent.create({
              name: scentName,
              stockQuantity: 1000 // מלאי התחלתי
            });
            stats.scents++;
            console.log(`    Created scent: ${scentName}`);
          }
          scentCache.set(scentName, scent);
        }
      }

      // פירסור תאריך מילוי אחרון
      let lastRefillDate = null;
      if (lastRefillText) {
        const parsed = new Date(lastRefillText);
        if (!isNaN(parsed.getTime())) {
          lastRefillDate = parsed;
        }
      }

      // יצירת מכשירים
      const parsedDevices = parseDevicesField(devicesText);

      if (parsedDevices.length === 0) {
        // אם אין מכשירים מפורטים, צור מכשיר ברירת מחדל
        parsedDevices.push({ deviceType: 'סטנדרטי', locationInBranch: '' });
      }

      for (const deviceData of parsedDevices) {
        await Device.create({
          branchId: branch._id,
          deviceType: deviceData.deviceType,
          locationInBranch: deviceData.locationInBranch,
          scentId: scent ? scent._id : null,
          lastRefillDate: lastRefillDate,
          isActive: true
        });
        stats.devices++;
      }

    } catch (error) {
      console.error(`Error processing line ${i + 1}:`, error.message);
    }
  }

  console.log('\n======================================');
  console.log('Migration completed!');
  console.log(`Customers: ${stats.customers}`);
  console.log(`Branches: ${stats.branches}`);
  console.log(`Devices: ${stats.devices}`);
  console.log(`Scents: ${stats.scents}`);
  console.log('======================================');

  await mongoose.disconnect();
}

// הרצת המיגרציה
migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
