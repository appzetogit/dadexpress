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
    console.log(JSON.stringify({
      _id: restaurant._id,
      name: restaurant.name,
      restaurantId: restaurant.restaurantId,
      slug: restaurant.slug,
      isActive: restaurant.isActive
    }, null, 2));

    const offers = await Offer.find({ restaurant: restaurant._id });
    console.log('\n--- Offers (' + offers.length + ') ---');
    offers.forEach(o => {
      console.log('Offer:', {
        _id: o._id,
        goalId: o.goalId,
        discountType: o.discountType,
        status: o.status,
        startDate: o.startDate,
        endDate: o.endDate,
        items: o.items ? o.items.map(i => ({ itemId: i.itemId, couponCode: i.couponCode })) : []
      });
    });

  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

check();
