import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FeeSettings from './backend/modules/admin/models/FeeSettings.js';

dotenv.config({ path: './backend/.env' });

async function checkSettings() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const settings = await FeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
    console.log('Current Active Fee Settings:', JSON.stringify(settings, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkSettings();
