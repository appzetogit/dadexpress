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

    const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));
    const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));

    const r = await Restaurant.findOne({ name: /Gurukripa/i }).lean();
    if (!r) {
        console.log('Restaurant not found');
        return;
    }

    const logs = await AuditLog.find({
        $or: [
            { entityId: r._id },
            { 'changes.restaurantId': r._id },
            { 'changes.restaurantName': r.name },
            { description: /Gurukripa/i }
        ]
    }).sort({ createdAt: -1 }).limit(50).lean();

    console.log(`Found ${logs.length} audit logs related to Gurukripa:`);
    logs.forEach(l => {
        console.log(`Date: ${l.createdAt}, Action: ${l.action}, Type: ${l.actionType}, PerformedBy: ${l.performedBy?.type}, Description: ${l.description}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

check();
