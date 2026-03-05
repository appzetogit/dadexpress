
import mongoose from 'mongoose';
import Order from '../backend/modules/order/models/Order.js';
import OrderSettlement from '../backend/modules/order/models/OrderSettlement.js';

const MONGODB_URI = 'mongodb+srv://dadexpress7392_db_user:PFlpxlxxIVcCAKBD@cluster0.mvacj1n.mongodb.net/dadexpress';

async function checkSettlements() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const deliveredOrders = await Order.find({ status: 'delivered' }).select('_id orderId pricing deliveredAt');
        console.log(`Found ${deliveredOrders.length} delivered orders:`);

        for (const order of deliveredOrders) {
            const settlement = await OrderSettlement.findOne({ orderId: order._id });
            console.log(`Order: ${order.orderId}, Total: ₹${order.pricing?.total}`);
            if (settlement) {
                console.log(`  Settlement found: Commission: ₹${settlement.adminEarning?.commission}, Platform: ₹${settlement.adminEarning?.platformFee}, Delivery: ₹${settlement.adminEarning?.deliveryFee}, GST: ₹${settlement.adminEarning?.gst}`);
                console.log(`  Total Admin Earning: ₹${(settlement.adminEarning?.commission || 0) + (settlement.adminEarning?.platformFee || 0) + (settlement.adminEarning?.deliveryFee || 0) + (settlement.adminEarning?.gst || 0)}`);
            } else {
                console.log('  ❌ No settlement found for this order!');
            }
        }

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSettlements();
