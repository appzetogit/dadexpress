import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    // 1. All Zones
    const zonesCol = db.collection('zones');
    const zones = await zonesCol.find().toArray();
    console.log('=== ALL ZONES ===');
    zones.forEach(zone => {
      console.log(`  ID: ${zone._id} | Name: ${zone.name} | Active: ${zone.isActive} | Coords: ${zone.coordinates?.length || 0} points`);
    });

    // 2. DiningRestaurants collection - their name, location, coordinates
    const diningCol = db.collection('diningrestaurants');
    const diningRestaurants = await diningCol.find().toArray();
    console.log(`\n=== DINING RESTAURANTS (${diningRestaurants.length} total) ===`);
    diningRestaurants.forEach(r => {
      console.log(`  Name: ${r.name}`);
      console.log(`  location: "${r.location}"`);
      console.log(`  coordinates: lat=${r.coordinates?.latitude} lng=${r.coordinates?.longitude}`);
      console.log(`  diningSettings.isEnabled: ${r.diningSettings?.isEnabled}`);
      console.log('  ---');
    });

    // 3. Main Restaurant collection - name, location.city, location coords
    const restCol = db.collection('restaurants');
    const restaurants = await restCol.find({ isActive: true }).toArray();
    console.log(`\n=== ACTIVE RESTAURANTS (${restaurants.length} total) ===`);
    restaurants.forEach(r => {
      const lat = r.location?.latitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
      const lng = r.location?.longitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
      console.log(`  Name: ${r.name}`);
      console.log(`  location.city: "${r.location?.city}"`);
      console.log(`  coordinates: lat=${lat} lng=${lng}`);
      console.log('  ---');
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
