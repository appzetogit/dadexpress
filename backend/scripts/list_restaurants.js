import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix .env path
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
  try {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not defined in .env');
        return;
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
    const restaurants = await Restaurant.find({}, 'name').lean();
    console.log('All restaurants:', restaurants.map(r => r.name));

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();
