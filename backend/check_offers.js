import mongoose from 'mongoose';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Offer from './modules/restaurant/models/Offer.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

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
      console.log('Restaurant not found for restaurantId: ' + restaurantId);
      // Try to list a few restaurants to see what IDs they have
      const someRestaurants = await Restaurant.find().limit(5).select('name restaurantId slug').lean();
      console.log('Sample restaurants in DB:');
      console.log(someRestaurants);
      return;
    }

    console.log(`Found Restaurant: ${restaurant.name} (_id: ${restaurant._id})`);

    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log(`Total offers found for this restaurant (any status): ${offers.length}`);

    if (offers.length === 0) {
      console.log('No offers found for this restaurant ObjectId.');
      // Check if there are ANY offers in the DB to see their structure
      const anyOffer = await Offer.findOne().lean();
      if (anyOffer) {
        console.log('Sample offer in DB (to check structure):');
        console.log(JSON.stringify(anyOffer, null, 2));
      } else {
        console.log('No offers found in the entire database.');
      }
    }

    offers.forEach((offer, index) => {
      console.log(`\n--- Offer ${index + 1} ---`);
      console.log(`ID: ${offer._id}`);
      console.log(`Status: ${offer.status}`);
      console.log(`Start Date: ${offer.startDate}`);
      console.log(`End Date: ${offer.endDate}`);
      console.log(`Items in Offer:`);
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach(item => {
          console.log(`  - itemId: ${item.itemId}, couponCode: ${item.couponCode}`);
          if (item.itemId === itemId) {
            console.log(`    ✅ MATCHES itemId: ${itemId}`);
          }
        });
      } else {
        console.log('  (No items in this offer)');
      }
      
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
