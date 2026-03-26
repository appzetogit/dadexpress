import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const orderSchema = new mongoose.Schema({
  payment: {
    method: String,
    status: String,
  },
  status: String,
  orderId: String,
}, { strict: false });

const Order = mongoose.model('Order', orderSchema);

async function checkOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const orders = await Order.find({}).sort({ createdAt: -1 }).limit(10).lean();
    console.log('Recent Orders Payment Status:');
    orders.forEach(o => {
      console.log(`Order: ${o.orderId || o._id}, Status: ${o.status}, Payment Method: ${o.payment?.method || o.paymentMethod}, Payment Status: ${o.payment?.status || o.paymentStatus}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkOrders();
