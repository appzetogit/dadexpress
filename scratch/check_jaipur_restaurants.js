import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('../backend/.env') });

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
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dadexpress';
    console.log('Connecting to database...');
    await mongoose.connect(uri);
    console.log('Connected!');

    const db = mongoose.connection.db;
    
    // Find Jaipur Zone
    const jaipurZone = await db.collection('zones').findOne({ 
      $or: [
        { name: /Jaipur/i },
        { zoneName: /Jaipur/i }
      ]
    });

    if (!jaipurZone) {
      console.log('Jaipur zone not found in zones collection!');
      process.exit(0);
    }

    console.log(`Found Jaipur Zone: ${jaipurZone.name || jaipurZone.zoneName}`);

    const restaurants = await db.collection('restaurants').find().toArray();
    console.log(`Total restaurants in DB: ${restaurants.length}`);

    const jaipurRestaurants = restaurants.filter(r => {
      const location = r.location;
      const coords = location?.coordinates;
      const lat = location?.latitude ?? (Array.isArray(coords) ? coords[1] : null);
      const lng = location?.longitude ?? (Array.isArray(coords) ? coords[0] : null);

      return isPointInZone(lat, lng, jaipurZone.coordinates);
    });

    console.log(`\n--- Restaurants in Jaipur Zone (${jaipurRestaurants.length}) ---`);
    jaipurRestaurants.forEach(r => {
      console.log(`- ${r.name} (Address: ${r.address || 'N/A'}, Location: ${JSON.stringify(r.location)})`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
