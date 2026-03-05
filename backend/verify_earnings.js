
import mongoose from 'mongoose';
import Order from './modules/order/models/Order.js';
import OrderSettlement from './modules/order/models/OrderSettlement.js';

const MONGODB_URI = 'mongodb+srv://dadexpress7392_db_user:PFlpxlxxIVcCAKBD@cluster0.mvacj1n.mongodb.net/dadexpress';

async function verifyEarnings() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const deliveredOrders = await Order.find({ status: 'delivered' }).select('orderId pricing');
        console.log(`Delivered Orders: ${deliveredOrders.length}`);

        let calcCommission = 0;
        let calcPlatform = 0;
        let calcDelivery = 0;
        let calcGST = 0;

        for (const order of deliveredOrders) {
            const settlement = await OrderSettlement.findOne({ orderId: order._id });
            if (settlement && settlement.adminEarning) {
                console.log(`Order ${order.orderId}: Sum from Settlement -> Commission: ${settlement.adminEarning.commission}, Platform: ${settlement.adminEarning.platformFee}, Delivery: ${settlement.adminEarning.deliveryFee}, GST: ${settlement.adminEarning.gst}`);
                calcCommission += settlement.adminEarning.commission;
                calcPlatform += settlement.adminEarning.platformFee;
                calcDelivery += settlement.adminEarning.deliveryFee;
                calcGST += settlement.adminEarning.gst;
            } else {
                console.log(`Order ${order.orderId}: No settlement found!`);
            }
        }

        console.log('------------------------------');
        console.log(`Calculated Totals:`);
        console.log(`Commission: ${calcCommission}`);
        console.log(`Platform: ${calcPlatform}`);
        console.log(`Delivery: ${calcDelivery}`);
        console.log(`GST: ${calcGST}`);
        console.log(`Total: ${calcCommission + calcPlatform + calcDelivery + calcGST}`);

        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

verifyEarnings();
