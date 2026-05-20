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
    console.log(`Lalganj Zone: ${lalganjZone.name}`);
    console.log(`Lalganj Coordinates Count: ${lalganjZone.coordinates?.length}`);
    console.log(`Lalganj Coordinates Sample:`, JSON.stringify(lalganjZone.coordinates?.slice(0, 3)));
    
    // Get Kanha Restaurant
    const restaurantsCol = db.collection('restaurants');
    const kanha = await restaurantsCol.findOne({ _id: new mongoose.Types.ObjectId('69c68a8902b0f21743ae0186') });
    
    console.log(`\nRestaurant: ${kanha.name}`);
    const rLat = kanha.location?.latitude || (Array.isArray(kanha.location?.coordinates) ? kanha.location.coordinates[1] : null);
    const rLng = kanha.location?.longitude || (Array.isArray(kanha.location?.coordinates) ? kanha.location.coordinates[0] : null);
    console.log(`Restaurant Lat: ${rLat}, Lng: ${rLng}`);
    
    const inZone = isPointInZone(rLat, rLng, lalganjZone.coordinates);
    console.log(`isPointInZone returned: ${inZone}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
