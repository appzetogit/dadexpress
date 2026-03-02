const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function run() {
  try {
    console.log('Connecting to:', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!');

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));

    // Try to find a delivery partner
    const deliveriesColl = mongoose.connection.db.collection('deliveries');
    const partner = await deliveriesColl.findOne({ 
      status: 'active', 
      'availability.isOnline': true 
    });
    console.log('Online Partner:', partner ? partner._id : 'None');

    // Try to find a recent order
    const ordersColl = mongoose.connection.db.collection('orders');
    const order = await ordersColl.findOne({ 
      status: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } 
    });
    console.log('Recent Order:', order ? order._id : 'None');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
