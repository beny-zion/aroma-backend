/**
 * Seed script for Device Types
 * Run: node scripts/seedDeviceTypes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { DeviceType } = require('../src/models');

const deviceTypes = [
  {
    name: 'גדול',
    description: 'מכשיר גדול - 400 מ"ל',
    mlPerRefill: 400,
    defaultRefillInterval: 30,
    price: 0,
    stockQuantity: 10,
    minStockAlert: 3,
    isActive: true
  },
  {
    name: 'אפליקציה',
    description: 'מכשיר אפליקציה - 200 מ"ל',
    mlPerRefill: 200,
    defaultRefillInterval: 45,
    price: 0,
    stockQuantity: 15,
    minStockAlert: 5,
    isActive: true
  },
  {
    name: 'מכשיליטר',
    description: 'מכשיליטר - 250 מ"ל',
    mlPerRefill: 250,
    defaultRefillInterval: 45,
    price: 0,
    stockQuantity: 10,
    minStockAlert: 3,
    isActive: true
  },
  {
    name: 'בינוני',
    description: 'מכשיר בינוני - 300 מ"ל',
    mlPerRefill: 300,
    defaultRefillInterval: 45,
    price: 0,
    stockQuantity: 10,
    minStockAlert: 3,
    isActive: true
  },
  {
    name: 'קטן בפנים',
    description: 'מכשיר קטן בפנים - 150 מ"ל',
    mlPerRefill: 150,
    defaultRefillInterval: 60,
    price: 0,
    stockQuantity: 15,
    minStockAlert: 5,
    isActive: true
  },
  {
    name: 'קטן',
    description: 'מכשיר קטן',
    mlPerRefill: 100,
    defaultRefillInterval: 60,
    price: 0,
    stockQuantity: 20,
    minStockAlert: 5,
    isActive: true
  },
  {
    name: 'דנקיו',
    description: 'מכשיר דנקיו',
    mlPerRefill: 200,
    defaultRefillInterval: 45,
    price: 0,
    stockQuantity: 10,
    minStockAlert: 3,
    isActive: true
  },
  {
    name: 'גדול הרניג 5',
    description: 'מכשיר גדול הרניג 5',
    mlPerRefill: 400,
    defaultRefillInterval: 30,
    price: 0,
    stockQuantity: 5,
    minStockAlert: 2,
    isActive: true
  },
  {
    name: 'גדול הרניג 6',
    description: 'מכשיר גדול הרניג 6',
    mlPerRefill: 400,
    defaultRefillInterval: 30,
    price: 0,
    stockQuantity: 5,
    minStockAlert: 2,
    isActive: true
  },
  {
    name: 'טאבלט',
    description: 'מכשיר טאבלט',
    mlPerRefill: 150,
    defaultRefillInterval: 60,
    price: 0,
    stockQuantity: 10,
    minStockAlert: 3,
    isActive: true
  }
];

async function seedDeviceTypes() {
  try {
    await connectDB();
    console.log('Connected to database');

    // בדיקה אם כבר קיימים סוגי מכשירים
    const existingCount = await DeviceType.countDocuments();
    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing device types.`);
      const answer = process.argv[2];
      if (answer !== '--force') {
        console.log('Use --force flag to override existing data');
        console.log('Example: node scripts/seedDeviceTypes.js --force');
        process.exit(0);
      }
      console.log('Deleting existing device types...');
      await DeviceType.deleteMany({});
    }

    // הוספת סוגי מכשירים
    console.log('Adding device types...');
    for (const deviceType of deviceTypes) {
      const created = await DeviceType.create(deviceType);
      console.log(`  ✓ Added: ${created.name}`);
    }

    console.log('\n✅ Successfully seeded device types!');
    console.log(`Total: ${deviceTypes.length} device types added`);

  } catch (error) {
    console.error('Error seeding device types:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

seedDeviceTypes();
