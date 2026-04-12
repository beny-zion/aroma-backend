/**
 * Seed script to create the initial admin user.
 * Usage: node scripts/seed-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');

const ADMIN_EMAIL = 'admin@aromaplus.co.il';
const ADMIN_PASSWORD = 'Admin123!';
const ADMIN_NAME = 'מנהל מערכת';

async function seedAdmin() {
  try {
    await connectDB();

    const User = require('../src/models/User');

    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin user already exists:', ADMIN_EMAIL);
      process.exit(0);
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const admin = await User.create({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
      isActive: true
    });

    console.log('Admin user created successfully!');
    console.log(`  Email:    ${admin.email}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  Role:     ${admin.role}`);
    console.log('\nPlease change the password after first login.');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
}

seedAdmin();
