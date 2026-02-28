import Order from '../models/Order.js';
import User from '../../auth/models/User.js';
import notificationService from '../../../shared/services/notificationService.js';

/**
 * Notify user about order status update
 * @param {string} orderId - Order ID
 * @param {string} status - New status
 */
export async function notifyUserOrderUpdate(orderId, status) {
    try {
        const order = await Order.findById(orderId).lean();
        if (!order) {
            console.warn(`⚠️ User Notification: Order ${orderId} not found`);
            return;
        }

        // Fetch User for FCM token
        const customer = await User.findById(order.userId).select('fcmToken fcmTokenMobile platform').lean();
        const fcmTokens = [];
        if (customer?.fcmToken) fcmTokens.push({ token: customer.fcmToken, plat: 'web' });
        if (customer?.fcmTokenMobile) fcmTokens.push({ token: customer.fcmTokenMobile, plat: 'app' });

        for (const { token, plat } of fcmTokens) {
            const statusMessages = {
                preparing: 'Your order is being prepared! 🍳',
                ready: 'Your order is ready for pickup! 🥡',
                out_for_delivery: 'Your order is out for delivery! 🛵',
                delivered: 'Your order has been delivered! Enjoy your meal! 🍽️',
                cancelled: 'Your order has been cancelled. ❌'
            };

            await notificationService.sendPushNotification(
                token,
                {
                    title: 'Order Update',
                    body: statusMessages[status] || `Your order status changed to ${status}`
                },
                {
                    orderId: order.orderId,
                    type: 'order_status',
                    click_action: `/orders/${order.orderId}`
                },
                customer.platform || plat || 'web'
            );

            console.log(`✅ Push notification sent to customer ${order.userId} (${plat}) for status: ${status}`);
        }

        // Also emit socket event to customer room
        try {
            const serverModule = await import('../../../server.js');
            const getIO = serverModule.getIO;
            const io = getIO ? getIO() : null;

            if (io) {
                // Rooms are usually formatted as order:${orderId} or user:${userId}
                io.to(`order:${order._id.toString()}`).emit('order_status_update', {
                    title: "Order Update",
                    message: `Your order status is now: ${status}`,
                    status: status,
                    orderId: order.orderId,
                    updatedAt: new Date()
                });
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
