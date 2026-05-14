const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI;

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    const Restaurant = mongoose.model('Restaurant', new mongoose.Schema({}, { strict: false }));
    const Offer = mongoose.model('Offer', new mongoose.Schema({}, { strict: false }));

    const restaurant = await Restaurant.findOne({ name: /Amazing pizza/i });
    if (!restaurant) {
      console.log('Restaurant not found');
      process.exit(0);
    }

    console.log('--- Restaurant ---');
    console.log(JSON.stringify(restaurant, null, 2));

    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log('\n--- Offers (' + offers.length + ') ---');
    console.log(JSON.stringify(offers, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

check();
