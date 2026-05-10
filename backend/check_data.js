import mongoose from 'mongoose';
import Restaurant from './modules/restaurant/models/Restaurant.js';
import Offer from './modules/restaurant/models/Offer.js';
import Menu from './modules/restaurant/models/Menu.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

// Try local DB if Atlas connection fails
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dadexpress';

async function checkData() {
  try {
    console.log(`Connecting to: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to MongoDB');

    const restaurantId = 'REST-1773901313364-5253';
    const itemIdFromRequest = 'item-1773901798173-0.24604636018089632';

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

    // Check Menu
    const menu = await Menu.findOne({ restaurant: restaurant._id });
    if (!menu) {
      console.log('Menu not found for this restaurant.');
    } else {
      console.log('Menu found. Checking items...');
      let itemFoundInMenu = false;
      menu.sections.forEach(section => {
        section.items.forEach(item => {
          if (item.id === itemIdFromRequest) {
            console.log(`  ✅ Item found in Menu! Name: ${item.name}, ID: ${item.id}`);
            itemFoundInMenu = true;
          }
        });
      });
      if (!itemFoundInMenu) {
        console.log(`  ❌ Item ${itemIdFromRequest} NOT found in Menu.`);
      }
    }

    // Check Offers
    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log(`\nTotal offers found for this restaurant (any status): ${offers.length}`);

    offers.forEach((offer, index) => {
      console.log(`\n--- Offer ${index + 1} ---`);
      console.log(`Status: ${offer.status}`);
      console.log(`Discount Type: ${offer.discountType}`);
      console.log(`Items in Offer:`);
      offer.items.forEach(item => {
        console.log(`  - itemId: ${item.itemId}, couponCode: ${item.couponCode}`);
        if (item.itemId === itemIdFromRequest) {
          console.log(`    ✅ MATCHES itemIdFromRequest!`);
        }
      });
      
      const now = new Date();
      const startValid = !offer.startDate || new Date(offer.startDate) <= now;
      const endValid = !offer.endDate || new Date(offer.endDate) >= now;
      console.log(`Dates: Start=${offer.startDate}, End=${offer.endDate}`);
      console.log(`Valid for now: ${startValid && endValid}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkData();
