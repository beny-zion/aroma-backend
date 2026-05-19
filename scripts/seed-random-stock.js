/**
 * Seed script to fill random stock quantities for all scents (testing only).
 * Generates a mix below/around/above minStockAlert so alerts can be tested.
 * Usage: node scripts/seed-random-stock.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Scent = require('../src/models/Scent');

function randomStock(unit, minAlert) {
  // 20% below alert, 50% healthy, 30% high stock — for realistic test coverage
  const roll = Math.random();
  if (unit === 'liter') {
    if (roll < 0.2) return Math.floor(Math.random() * Math.max(1, minAlert));
    if (roll < 0.7) return Math.floor(minAlert + Math.random() * (minAlert * 4));
    return Math.floor(minAlert * 5 + Math.random() * (minAlert * 10));
  }
  // ml
  if (roll < 0.2) return Math.floor(Math.random() * minAlert);
  if (roll < 0.7) return Math.floor(minAlert + Math.random() * 2500);
  return Math.floor(3000 + Math.random() * 5000);
}

async function seedRandomStock() {
  try {
    await connectDB();

    const scents = await Scent.find({ isActive: true });
    if (scents.length === 0) {
      console.log('No active scents found.');
      process.exit(0);
    }

    console.log(`Updating ${scents.length} active scents with random stock...\n`);

    let below = 0;
    let healthy = 0;
    let high = 0;

    const ops = scents.map((scent) => {
      const minAlert = scent.minStockAlert || 500;
      const newStock = randomStock(scent.unit, minAlert);

      if (newStock < minAlert) below++;
      else if (newStock < minAlert * 5) healthy++;
      else high++;

      console.log(
        `  ${scent.name.padEnd(30)} ${String(newStock).padStart(6)} ${scent.unit}` +
        (newStock < minAlert ? '  ⚠ below alert' : '')
      );

      return {
        updateOne: {
          filter: { _id: scent._id },
          update: { $set: { stockQuantity: newStock } }
        }
      };
    });

    const result = await Scent.bulkWrite(ops);

    console.log('\n----- Summary -----');
    console.log(`Modified:       ${result.modifiedCount}`);
    console.log(`Below alert:    ${below}`);
    console.log(`Healthy stock:  ${healthy}`);
    console.log(`High stock:     ${high}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding random stock:', error.message);
    process.exit(1);
  }
}

seedRandomStock();
