import mongoose from 'mongoose';
import Restaurant from './backend/modules/restaurant/models/Restaurant.js';
import Offer from './backend/modules/restaurant/models/Offer.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dadexpress';

async function checkOffers() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const restaurantId = 'REST-1773901313364-5253';
    const itemId = 'item-1773901798173-0.24604636018089632';

    const restaurant = await Restaurant.findOne({
      $or: [
        { restaurantId: restaurantId },
        { slug: restaurantId }
      ]
    });

    if (!restaurant) {
      console.log('Restaurant not found');
      return;
    }

    console.log(`Found Restaurant: ${restaurant.name} (_id: ${restaurant._id})`);

    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log(`Total offers found for this restaurant (any status): ${offers.length}`);

    offers.forEach((offer, index) => {
      console.log(`\n--- Offer ${index + 1} ---`);
      console.log(`ID: ${offer._id}`);
      console.log(`Status: ${offer.status}`);
      console.log(`Start Date: ${offer.startDate}`);
      console.log(`End Date: ${offer.endDate}`);
      console.log(`Items in Offer:`);
      offer.items.forEach(item => {
        console.log(`  - itemId: ${item.itemId}, couponCode: ${item.couponCode}`);
      });
      
      const now = new Date();
      const startValid = !offer.startDate || new Date(offer.startDate) <= now;
      const endValid = !offer.endDate || new Date(offer.endDate) >= now;
      console.log(`Valid for current time (${now.toISOString()}): ${startValid && endValid}`);
      if (!startValid) console.log(`  Reason: Start date ${offer.startDate} is in future`);
      if (!endValid) console.log(`  Reason: End date ${offer.endDate} is in past`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkOffers();
