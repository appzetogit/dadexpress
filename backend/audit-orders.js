import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './modules/order/models/Order.js';

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

      if (!id) return;
      if (id.includes(' ')) issues.push('Contains spaces');
      if (id.endsWith(' ')) issues.push('Trailing space');
      if (!id.startsWith('ORD-') && !id.match(/^ORD\s+-\s+/)) issues.push('Unexpected format');
      if (id.match(/ORD\s+-\s+/)) issues.push('Legacy spaced format');

      if (issues.length > 0) {
        inconsistencies.push({
          mongoId: order._id,
          orderId: id,
          issues: issues.join(', ')
        });
      }
    });

    if (inconsistencies.length > 0) {
      console.log('Found inconsistencies:');
      console.table(inconsistencies.slice(0, 20)); // Limit to 20 for brief view
      if (inconsistencies.length > 20) console.log(`... and ${inconsistencies.length - 20} more.`);
    } else {
      console.log('No inconsistencies found in orderId formats.');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Audit failed:', error);
  }
}

auditOrders();
