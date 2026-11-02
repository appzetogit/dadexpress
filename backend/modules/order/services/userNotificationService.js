import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../../auth/models/User.js';
import notificationService from '../../../shared/services/notificationService.js';

/**
 * Notify user about order status update
 * @param {string} orderId - Order ID (MongoDB ObjectId or orderId string)
 * @param {string} status - New status ('confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')
 */
export async function notifyUserOrderUpdate(orderId, status) {
    try {
        let order = null;
        if (mongoose.Types.ObjectId.isValid(orderId) && String(orderId).length === 24) {
            order = await Order.findById(orderId).lean();
        }
        if (!order) {
            order = await Order.findOne({ orderId: orderId }).lean();
        }
        if (!order) {
            console.warn(`⚠️ User Notification: Order ${orderId} not found`);
            return;
        }

        // Fetch User for FCM token and platform
        const customer = await User.findById(order.userId).select('fcmToken fcmTokenMobile platform').lean();
        if (!customer) {
            console.warn(`⚠️ User Notification: Customer ${order.userId} not found`);
            return;
        }

        const fcmTokensSet = new Set();
        if (customer.fcmToken) fcmTokensSet.add(JSON.stringify({ token: customer.fcmToken, plat: 'web' }));
        if (customer.fcmTokenMobile) fcmTokensSet.add(JSON.stringify({ token: customer.fcmTokenMobile, plat: customer.platform || 'app' }));

        const fcmTokens = Array.from(fcmTokensSet).map(s => JSON.parse(s));

        const isCancelled = status === 'cancelled';
        const titleMap = {
            confirmed: 'Order Confirmed! 🎉',
            pending: 'Order Placed! ⏳',
            preparing: 'Preparing Your Order! 🍳',
            ready: 'Order Ready for Pickup! 🥡',
            out_for_delivery: 'Out for Delivery! 🛵',
            delivered: 'Order Delivered! 🍽️',
            cancelled: 'Order Cancelled ❌'
        };

        const title = titleMap[status] || 'Order Update';

        let body = `Your order status changed to ${status}`;
        if (isCancelled) {
            if (order.cancellationReason && order.cancellationReason.trim()) {
                body = `Your order #${order.orderId} was cancelled: ${order.cancellationReason}`;
            } else {
                body = `Your order #${order.orderId} has been cancelled.`;
            }
        } else {
            const statusMessages = {
                confirmed: `Your order #${order.orderId} has been confirmed! 🎉`,
                pending: `Your order #${order.orderId} has been placed and is awaiting confirmation! ⏳`,
                preparing: `Your order #${order.orderId} is being prepared! 🍳`,
                ready: `Your order #${order.orderId} is ready for pickup! 🥡`,
                out_for_delivery: `Your order #${order.orderId} is out for delivery! 🛵`,
                delivered: `Your order #${order.orderId} has been delivered! Enjoy your meal! 🍽️`
            };
            body = statusMessages[status] || body;
        }

        for (const { token, plat } of fcmTokens) {
            await notificationService.sendPushNotification(
                token,
                {
                    title,
                    body,
                    image: order.items?.[0]?.image || '/dadexpress.jpeg'
                },
                {
                    orderId: String(order.orderId),
                    orderDbId: String(order._id),
                    type: 'order_status',
                    status: String(status),
                    click_action: `/orders/${order.orderId}`
                },
                plat || customer.platform || 'web'
            );

            console.log(`✅ Push notification sent to customer ${order.userId} (${plat}) for status: ${status}`);
        }

        // Also emit socket event to customer room
        try {
            const serverModule = await import('../../../server.js');
            const getIO = serverModule.getIO;
            const io = getIO ? getIO() : null;

            if (io) {
                const socketPayload = {
                    title,
                    message: body,
                    status: status,
                    orderId: order.orderId,
                    orderDbId: order._id.toString(),
                    cancellationReason: order.cancellationReason || null,
                    updatedAt: new Date()
                };

                // Emit to order-specific rooms and user room
                io.to(`order:${order._id.toString()}`).emit('order_status_update', socketPayload);
                io.to(`order:${order.orderId}`).emit('order_status_update', socketPayload);
                io.to(`user:${order.userId.toString()}`).emit('order_status_update', socketPayload);
                console.log(`📢 Socket notification sent to customer for order ${order.orderId}`);
            }
        } catch (socketError) {
            console.error('Error sending socket notification to user:', socketError);
        }
    } catch (error) {
        console.error('Error in notifyUserOrderUpdate:', error);
    }
}

export default {
    notifyUserOrderUpdate
};
