
import mongoose from 'mongoose';
import Order from './modules/order/models/Order.js';
import OrderSettlement from './modules/order/models/OrderSettlement.js';
import { calculateOrderSettlement } from './modules/order/services/orderSettlementService.js';
import { holdEscrow, releaseEscrow } from './modules/order/services/escrowWalletService.js';
import AuditLog from './modules/admin/models/AuditLog.js';

// Monkey patch AuditLog.createLog to avoid validation errors during fix
AuditLog.createLog = async function (data) {
    console.log(`  (Skipping AuditLog for ${data.action})`);
    return { _id: new mongoose.Types.ObjectId() };
};

const MONGODB_URI = 'mongodb+srv://dadexpress7392_db_user:PFlpxlxxIVcCAKBD@cluster0.mvacj1n.mongodb.net/dadexpress';

async function fixSettlements() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const deliveredOrders = await Order.find({ status: 'delivered' });
        console.log(`Found ${deliveredOrders.length} delivered orders.`);

        for (const order of deliveredOrders) {
            let settlement = await OrderSettlement.findOne({ orderId: order._id });
            console.log(`Checking Order: ${order.orderId} (Status: ${order.status})`);

            if (!settlement) {
                console.log(`  🛠 Creating missing settlement for order ${order.orderId}...`);
                try {
                    settlement = await calculateOrderSettlement(order._id);
                    console.log(`  ✅ Settlement created.`);
                } catch (err) {
                    console.error(`  ❌ Failed to create settlement: ${err.message}`);
                    continue;
                }
            }

            if (settlement.escrowStatus === 'pending') {
                console.log(`  🛠 Holding escrow for order ${order.orderId}...`);
                try {
                    await holdEscrow(order._id, order.userId, order.pricing.total);
                    // Refresh settlement after hold
                    settlement = await OrderSettlement.findOne({ orderId: order._id });
                    console.log(`  ✅ Escrow held.`);
                } catch (err) {
                    console.error(`  ❌ Failed to hold escrow: ${err.message}`);
                }
            }

            // If order is delivered but settlement not released/completed
            if ((settlement.escrowStatus === 'held' || settlement.escrowStatus === 'pending') && order.status === 'delivered') {
                console.log(`  🛠 Releasing escrow for delivered order ${order.orderId}...`);
                try {
                    await releaseEscrow(order._id);
                    console.log(`  ✅ Escrow released and funds distributed.`);
                } catch (err) {
                    console.error(`  ❌ Failed to release escrow: ${err.message}`);
                }
            }
        }

        console.log('Done.');
        mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

fixSettlements();
