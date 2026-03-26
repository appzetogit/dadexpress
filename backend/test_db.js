import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = 'mongodb+srv://dadexpress7392_db_user:PFlpxlxxIVcCAKBD@ac-9nisify.mvacj1n.mongodb.net/dadexpress?retryWrites=true&w=majority';

async function checkDB() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const deliveries = await db.collection('deliveries').find({}).toArray();
  console.log('Total deliveries:', deliveries.length);
  deliveries.slice(0, 5).forEach(d => console.log(d.phone, d.status, d.isActive, d.name));
  await mongoose.disconnect();
}

checkDB().catch(console.error);
