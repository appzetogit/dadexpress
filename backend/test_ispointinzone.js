import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Zone from './modules/admin/models/Zone.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
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

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const zoneId = '69f744d82f6621d98ed002bd'; // Lalganj UP
  const userZone = await Zone.findById(zoneId).lean();
  console.log('Zone:', userZone.name);
  
  const allRestaurants = await Restaurant.find({ isActive: true }).select('location name').lean();
  console.log('Total active restaurants:', allRestaurants.length);
  
  let restaurantIdsInZone = allRestaurants
    .filter(r => {
      const lat = r.location?.latitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
      const lng = r.location?.longitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
      return isPointInZone(lat, lng, userZone.coordinates);
    });
    
  console.log('Restaurants in Lalganj UP zone:', restaurantIdsInZone.map(r => r.name));
  
  const jaipurZoneId = '69baf405a125894583042910';
  const jaipurZone = await Zone.findById(jaipurZoneId).lean();
  
  let restaurantIdsInJaipur = allRestaurants
    .filter(r => {
      const lat = r.location?.latitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
      const lng = r.location?.longitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
      return isPointInZone(lat, lng, jaipurZone.coordinates);
    });
    
  console.log('Restaurants in Jaipur zone:', restaurantIdsInJaipur.length);
  
  mongoose.disconnect();
}

test();
