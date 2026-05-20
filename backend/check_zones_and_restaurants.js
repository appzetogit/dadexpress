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
      console.log(`boundary coordinates:`, JSON.stringify(zone.boundary?.coordinates));
      console.log('-----------------');
    });

    // Check all restaurants
    const restaurantsCol = db.collection('restaurants');
    const restaurants = await restaurantsCol.find().toArray();
    console.log('\n--- ALL RESTAURANTS ---');
    restaurants.forEach(rest => {
      console.log(`Restaurant ID: ${rest._id}`);
      console.log(`Name: ${rest.name}`);
      console.log(`isActive: ${rest.isActive}`);
      console.log(`Location:`, JSON.stringify(rest.location));
      console.log('-----------------------');
    });

    // Check Gourmet
    const gourmetCol = db.collection('gourmetrestaurants');
    const gourmet = await gourmetCol.find().toArray();
    console.log('\n--- GOURMET RESTAURANTS ---');
    gourmet.forEach(g => {
      console.log(`Gourmet ID: ${g._id}, Restaurant: ${g.restaurant}, isActive: ${g.isActive}`);
    });

    // Check Top 10
    const top10Col = db.collection('top10restaurants');
    const top10 = await top10Col.find().toArray();
    console.log('\n--- TOP 10 RESTAURANTS ---');
    top10.forEach(t => {
      console.log(`Top 10 ID: ${t._id}, Restaurant: ${t.restaurant}, Rank: ${t.rank}, isActive: ${t.isActive}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
