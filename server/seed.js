/* ===================================================================
   Seed Script — Creates default admin user
   Run: node seed.js
   =================================================================== */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN_DATA = {
  name: 'Admin',
  email: 'admin@emergency.com',
  password: 'admin123',
  phone: '+91 9999999999',
  role: 'admin'
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Check if admin exists
    const existing = await User.findOne({ email: ADMIN_DATA.email });
    if (existing) {
      console.log('Admin user already exists:');
      console.log(`  Email: ${ADMIN_DATA.email}`);
      console.log(`  Password: ${ADMIN_DATA.password}`);
    } else {
      await User.create(ADMIN_DATA);
      console.log('✅ Admin user created:');
      console.log(`  Email: ${ADMIN_DATA.email}`);
      console.log(`  Password: ${ADMIN_DATA.password}`);
    }

    // Also create a test user
    const testUser = await User.findOne({ email: 'user@test.com' });
    if (!testUser) {
      await User.create({
        name: 'Test User',
        email: 'user@test.com',
        password: 'user123',
        phone: '+91 8888888888',
        role: 'user'
      });
      console.log('\n✅ Test user created:');
      console.log('  Email: user@test.com');
      console.log('  Password: user123');
    } else {
      console.log('\nTest user already exists:');
      console.log('  Email: user@test.com');
      console.log('  Password: user123');
    }

    console.log('\n🎉 Seed complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error.message);
    process.exit(1);
  }
}

seed();
