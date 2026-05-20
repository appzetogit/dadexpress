import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Check all zones
    const zonesCol = db.collection('zones');
    const zones = await zonesCol.find().toArray();
    console.log('--- ALL ZONES ---');
    zones.forEach(zone => {
      console.log(`Zone ID: ${zone._id}`);
      console.log(`Name: ${zone.name}`);
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
