import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dad_express';

async function checkDB() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  const deliveries = await db.collection('deliveries').find({}).toArray();
  console.log('Total deliveries:', deliveries.length);
  deliveries.slice(0, 5).forEach(d => console.log(d.phone, d.status, d.isActive, d.name));
  await mongoose.disconnect();
}

checkDB().catch(console.error);
