import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '../backend/.env' });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dadexpress');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Check all zones
    const zonesCol = db.collection('zones');
    const zones = await zonesCol.find().toArray();
    console.log('--- ALL ZONES ---');
    zones.forEach(zone => {
      console.log(`Zone ID: ${zone._id}`);
      console.log(`Name: ${zone.name || zone.zoneName}`);
      console.log(`isActive: ${zone.isActive}`);
      console.log(`coordinates count: ${zone.coordinates ? zone.coordinates.length : 0}`);
      console.log(`coordinates:`, JSON.stringify(zone.coordinates));
      console.log('-----------------');
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
