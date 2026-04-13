import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../backend/.env') });

const OrderSchema = new mongoose.Schema({
  orderId: String,
  status: String,
  payment: {
    method: String,
    status: String
  },
  createdAt: Date
}, { strict: false });

const Order = mongoose.model('Order', OrderSchema);

async function checkOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    console.log('Recent 10 orders:');
    recentOrders.forEach(o => {
      console.log(`ID: ${o.orderId}, Status: ${o.status}, Payment Method: ${o.payment?.method}, Payment Status: ${o.payment?.status}, Created: ${o.createdAt}`);
    });

    // Count pending razorpay orders
    const pendingRazorpay = await Order.countDocuments({
      'payment.method': 'razorpay',
      'payment.status': 'pending'
    });
    console.log(`Total pending Razorpay orders: ${pendingRazorpay}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOrders();
