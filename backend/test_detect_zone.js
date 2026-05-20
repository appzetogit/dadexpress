import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Zone from './modules/admin/models/Zone.js';

// Ray casting algorithm from backend
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
    
    const activeZones = await Zone.find({ isActive: true }).lean();
    console.log(`Loaded ${activeZones.length} active zones`);
    
    // Test coordinates of UP manual address
    const userLat = 26.1947967;
    const userLng = 81.0180168;
    
    console.log(`\nTesting coordinates: Lat: ${userLat}, Lng: ${userLng}`);
    
    for (const zone of activeZones) {
      const inside = isPointInZone(userLat, userLng, zone.coordinates);
      console.log(`Zone: ${zone.name || zone.zoneName} | ID: ${zone._id} | Inside: ${inside}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
