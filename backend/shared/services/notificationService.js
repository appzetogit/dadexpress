import admin from 'firebase-admin';
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
    ],
});

class NotificationService {
    /**
     * Send a push notification to a specific device
     * @param {string} token - FCM registration token
     * @param {Object} notification - Notification object { title, body }
     * @param {Object} data - Optional data payload
     * @param {string} platform - 'web', 'ios', 'android', 'app'
     */
    async sendPushNotification(token, notification, data = {}, platform = 'web') {
        if (!token) {
            logger.warn('FCM token is missing, skipping notification');
            return null;
        }

        const logoUrl = process.env.CORS_ORIGIN ? `${process.env.CORS_ORIGIN}/dadexpress.jpeg` : '/dadexpress.jpeg';

        const message = {
            token: token,
            data: {
                ...data,
                title: notification.title,
                body: notification.body,
                image: notification.image || logoUrl,
                click_action: data.click_action || '/',
            },
        };

        // Root 'notification' property is REMOVED to prevent browser double notification.
        // We use platform-specific blocks for Mobile.


        // Platform specific optimizations
        if (platform === 'ios') {
            message.apns = {
                payload: {
                    aps: {
                        alert: {
                            title: notification.title,
                            body: notification.body,
                        },
                        sound: 'default',
                        badge: 1,
                        'mutable-content': 1
                    },
                },
            };
            if (notification.image) {
                message.apns.fcm_options = { image: notification.image };
            }
        } else if (platform === 'android' || platform === 'app') {
            message.android = {
                priority: 'high',
                ttl: 3600000, // 1 hour TTL
                notification: {
                    sound: 'default',
                    icon: 'ic_launcher',
                    color: '#FF5E00',
                    clickAction: data.click_action || '/',
                    image: notification.image || logoUrl,
                    channelId: 'high_priority_notifications',
                    vibrateTimings: [0, 500, 200, 500] // Powerful vibration
                },
            };
        } else if (platform === 'web') {
            message.webpush = {
                fcmOptions: {
                    link: data.link || data.click_action || '/'
                }
            };
        }

        try {
            const response = await admin.messaging().send(message);
            logger.info('Successfully sent push notification:', response);
            return response;
        } catch (error) {
            if (error.code === 'messaging/registration-token-not-registered') {
                logger.warn('FCM token is no longer valid, should be removed from database');
            }
            logger.error('Error sending push notification:', error);
            return null;
        }
    }

    /**
     * Send notification to a list of tokens
     */
    async sendMulticastNotification(tokens, notification, data = {}) {
        if (!tokens || tokens.length === 0) return null;

        const cleanTokens = tokens.filter(t => !!t);

        // FCM data values must all be strings
        const stringData = {};
        for (const [key, val] of Object.entries(data)) {
            stringData[key] = String(val ?? '');
        }

        const logoUrl = process.env.CORS_ORIGIN ? `${process.env.CORS_ORIGIN}/dadexpress.jpeg` : '/dadexpress.jpeg';

        const message = {
            tokens: cleanTokens,
            data: {
                ...stringData,
                title: notification.title,
                body: notification.body,
                image: notification.image || logoUrl,
                click_action: data.click_action || '/'
            },
            android: {
                priority: 'high',
                notification: {
                    icon: 'ic_launcher',
                    sound: 'default',
                    image: notification.image || logoUrl
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        'mutable-content': 1
                    },
                },
            },
            webpush: {
                fcmOptions: {
                    link: notification.click_action || '/'
                }
            }
        };

        // For non-web platforms, we can add the root notification block
        // However, for multicast we don't know the mix of tokens easily.
        // It's safer to rely on platform-specific blocks (Android/APNS) for the notification content.
        // The root 'notification' is what triggers the browser's automatic notification.
        // So we REMOVE it from the root message in multicast as well.

        if (notification.image) {
            message.apns.fcm_options = { image: notification.image };
        }

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            logger.info(`[FCM] ${response.successCount}/${cleanTokens.length} messages sent successfully`);

            // Log per-token errors for debugging
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        logger.error(`[FCM] Token #${idx} failed: ${resp.error?.code} - ${resp.error?.message}`);
                        logger.error(`[FCM] Failed token: ${cleanTokens[idx]}`);
                    }
                });
            }

            return response;
        } catch (error) {
            logger.error('[FCM] Error sending multicast notification:', error.code, error.message);
            return null;
        }
    }
}

export default new NotificationService();
