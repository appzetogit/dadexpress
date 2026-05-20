import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

function isPointInZone(lat, lng, zoneCoordinates) {
  if (lat == null || lng == null) return false;
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    
    const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
    const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
    const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
    const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;
    
    if (xi === null || yi === null || xj === null || yj === null) continue;
    
    const intersect = ((yi > lng) !== (yj > lng)) && 
                     (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Get Lalganj Zone
    const zonesCol = db.collection('zones');
    const lalganjZone = await zonesCol.findOne({ _id: new mongoose.Types.ObjectId('69f744d82f6621d98ed002bd') });
    console.log(`Zone: ${lalganjZone.name}`);
    
    // Find all active restaurants
    const restaurantsCol = db.collection('restaurants');
    const allRestaurants = await restaurantsCol.find({ isActive: true }).toArray();
    
    console.log(`Total active restaurants in DB: ${allRestaurants.length}`);
    
    const matching = [];
    allRestaurants.forEach(r => {
      const lat = r.location?.latitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
      const lng = r.location?.longitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
      const matched = isPointInZone(lat, lng, lalganjZone.coordinates);
      if (matched) {
        matching.push({ id: r._id, name: r.name, lat, lng });
      }
    });
    
    console.log(`\nRestaurants matching Lalganj zone:`, matching.length);
    matching.forEach(m => {
      console.log(`- ${m.name} (${m.id}) at [${m.lat}, ${m.lng}]`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
