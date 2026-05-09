import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'd:/dadexpress/dad-express/backend/.env' });

async function checkRestaurants() {
  try {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in .env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const restaurants = await db.collection('restaurants').find({ 
      isActive: true,
      'location.coordinates': { $exists: true } 
    }).limit(5).toArray();
    
    console.log('Restaurants with coordinates:');
    restaurants.forEach(r => {
      console.log(`Name: ${r.name}`);
      console.log(`Coordinates: ${JSON.stringify(r.location.coordinates)}`);
      console.log(`Lat/Lng fields: ${r.location.latitude}/${r.location.longitude}`);
      console.log('---');
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkRestaurants();
