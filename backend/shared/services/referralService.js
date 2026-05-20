import mongoose from 'mongoose';
import User from '../../modules/auth/models/User.js';
import BusinessSettings from '../../modules/admin/models/BusinessSettings.js';
import ReferralLog from '../../modules/admin/models/ReferralLog.js';
import UserWallet from '../../modules/user/models/UserWallet.js';
import Order from '../../modules/order/models/Order.js';
import notificationService from './notificationService.js';

class ReferralService {
    /**
     * Processes referral rewards for a completed order.
     * @param {Object} orderDoc - The Order document
     */
    async processOrderReferral(orderDoc) {
        try {
            if (!orderDoc || !orderDoc._id) {
                console.warn('⚠️ [REFERRAL-SERVICE] Invalid order provided to processOrderReferral.');
                return;
            }

            // 1. Fetch fresh order document from database to ensure status is 'delivered'
            const order = await Order.findById(orderDoc._id);
            if (!order || order.status !== 'delivered') {
                return;
            }

            const userId = order.userId;
            if (!userId) {
                return;
            }

            // 2. Fetch referee user and verify referredBy linkage
            const refereeUser = await User.findById(userId);
            if (!refereeUser || !refereeUser.referredBy) {
                return;
            }

            // 3. Fetch global referral business settings
            const settings = await BusinessSettings.getSettings();
            if (!settings?.referral?.isEnabled) {
                return;
            }

            // 4. Find the pending referral log for this referee
            const log = await ReferralLog.findOne({
                referrer: refereeUser.referredBy,
                referee: refereeUser._id,
                status: 'pending'
            });

            if (!log) {
                return;
            }

            // 5. Criteria check: First successful order of minimum value
            const orderTotal = order.pricing?.total || 0;
            const minOrderValue = settings.referral.minOrderValue || 0;

            // Check if this is truly the referee's first DELIVERED order
            const previousOrdersCount = await Order.countDocuments({
                userId: refereeUser._id,
                status: 'delivered',
                _id: { $ne: order._id }
            });

            if (previousOrdersCount > 0) {
                console.log(`ℹ️ [REFERRAL-SERVICE] Referee ${refereeUser.name} already has ${previousOrdersCount} delivered orders. Skipping referral reward.`);
                return;
            }

            if (orderTotal < minOrderValue) {
                console.log(`ℹ️ [REFERRAL-SERVICE] Order total ₹${orderTotal} is below the minimum threshold of ₹${minOrderValue}. Skipping referral reward.`);
                return;
            }

            const referrerReward = settings.referral.referrerReward || 0;
            const refereeReward = settings.referral.refereeReward || 0;

            // 6. Credit Referrer
            const referrer = await User.findByIdAndUpdate(refereeUser.referredBy, {
                $inc: {
                    'wallet.balance': referrerReward,
                    'referralStats.completed': 1,
                    'referralStats.pending': -1,
                    'referralStats.earned': referrerReward
                }
            }, { new: true });

            // Add transaction to UserWallet for referrer
            try {
                const referrerWallet = await UserWallet.findOrCreateByUserId(refereeUser.referredBy);
                await referrerWallet.addTransaction({
                    amount: referrerReward,
                    type: 'addition',
                    status: 'Completed',
                    description: `Referral Reward - ${refereeUser.name} completed first order`,
                    orderId: order._id
                });
                await referrerWallet.save();
            } catch (walletErr) {
                console.error('⚠️ [REFERRAL-SERVICE] Could not record referrer reward in UserWallet:', walletErr.message);
            }

            // 7. Credit Referee
            await User.findByIdAndUpdate(refereeUser._id, {
                $inc: { 'wallet.balance': refereeReward }
            });

            // Add transaction to UserWallet for referee
            try {
                const refereeWallet = await UserWallet.findOrCreateByUserId(refereeUser._id);
                await refereeWallet.addTransaction({
                    amount: refereeReward,
                    type: 'addition',
                    status: 'Completed',
                    description: `Joining Reward - Completed first order (min ₹${minOrderValue})`,
                    orderId: order._id
                });
                await refereeWallet.save();
            } catch (walletErr) {
                console.error('⚠️ [REFERRAL-SERVICE] Could not record referee reward in UserWallet:', walletErr.message);
            }

            // 8. Update Referral Log
            log.status = 'completed';
            log.referrerReward = referrerReward;
            log.refereeReward = refereeReward;
            log.orderId = order._id;
            await log.save();

            console.log(`🎁 [REFERRAL-SERVICE] Referral rewards successfully credited! Referrer: +₹${referrerReward}, Referee: +₹${refereeReward} for order ${order.orderId}`);

            // 9. Send Push Notifications
            try {
                // Notify Referrer
                if (referrer && (referrer.fcmToken || referrer.fcmTokenMobile)) {
                    await notificationService.sendPushNotification(
                        referrer.fcmTokenMobile || referrer.fcmToken,
                        {
                            title: '🎁 Referral Reward Earned!',
                            body: `Congratulations! You earned ₹${referrerReward} because ${refereeUser.name} completed their first order.`
                        },
                        { click_action: '/profile/refer-and-earn', type: 'referral_reward' },
                        referrer.platform || 'web'
                    );
                }

                // Notify Referee
                if (refereeUser.fcmToken || refereeUser.fcmTokenMobile) {
                    await notificationService.sendPushNotification(
                        refereeUser.fcmTokenMobile || refereeUser.fcmToken,
                        {
                            title: '🎁 Joining Bonus Credited!',
                            body: `You've earned ₹${refereeReward} joining bonus for completing your first order. Keep ordering!`
                        },
                        { click_action: '/profile/wallet', type: 'joining_bonus' },
                        refereeUser.platform || 'web'
                    );
                }
            } catch (notifErr) {
                console.error('⚠️ [REFERRAL-SERVICE] Could not send referral push notifications:', notifErr.message);
            }

        } catch (error) {
            console.error(`❌ [REFERRAL-SERVICE] Error processing referral rewards for order:`, error.message);
        }
    }
}

export default new ReferralService();
