import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './backend/modules/order/models/Order.js';

dotenv.config();

async function auditOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const orders = await Order.find({ orderId: /ORD/ }).lean();
    console.log(`Auditing ${orders.length} orders...`);

    const inconsistencies = [];

    orders.forEach(order => {
      const id = order.orderId;
      const issues = [];

      if (id.includes(' ')) issues.push('Contains spaces');
      if (id.endsWith(' ')) issues.push('Trailing space');
      if (!id.startsWith('ORD-')) issues.push('Incorrect prefix format');
      if (id.match(/ORD\s+-\s+/)) issues.push('Legacy spaced format');

      if (issues.length > 0) {
        inconsistencies.push({
          mongoId: order._id,
          orderId: id,
          issues
        });
      }
    });

    if (inconsistencies.length > 0) {
      console.log('Found inconsistencies:');
      console.table(inconsistencies);
    } else {
      console.log('No inconsistencies found in orderId formats.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Audit failed:', error);
  }
}

auditOrders();
