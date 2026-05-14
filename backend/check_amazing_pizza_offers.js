import mongoose from 'mongoose';
import Offer from './modules/restaurant/models/Offer.js';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkOffers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const restaurant = await Restaurant.findOne({ name: /Amazing pizza/i });
    if (!restaurant) {
      console.log('Restaurant not found');
      process.exit(0);
    }

    console.log('Restaurant found:', restaurant.name, restaurant._id);
    console.log('Restaurant profile offer text:', restaurant.offer);

    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log('Offers found in DB:', offers.length);
    
    offers.forEach(offer => {
      console.log('---');
      console.log('Coupon Code:', offer.couponCode);
      console.log('Status:', offer.status);
      console.log('Items:', JSON.stringify(offer.items));
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOffers();
