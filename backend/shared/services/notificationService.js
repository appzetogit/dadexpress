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

        const message = {
            token: token,
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...data,
                click_action: data.click_action || '/',
            },
        };

        // Platform specific optimizations
        if (platform === 'ios') {
            message.apns = {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            };
        } else if (platform === 'android') {
            message.android = {
                priority: 'high',
                notification: {
                    sound: 'default',
                    clickAction: data.click_action || '/',
                },
            };
        } else if (platform === 'web') {
            message.webpush = {
                notification: {
                    icon: '/dadexpress.jpeg',
                    link: data.link || '/',
                },
            };
        }

        try {
            const response = await admin.messaging().send(message);
            logger.info('Successfully sent push notification:', response);
            return response;
        } catch (error) {
            if (error.code === 'messaging/registration-token-not-registered') {
                logger.warn('FCM token is no longer valid, should be removed from database');
                // Ideally we should return a flag to remove it
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

        const message = {
            tokens: cleanTokens,
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: stringData,
            android: {
                priority: 'high',
                notification: {
                    icon: 'ic_launcher',
                    sound: 'default',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
            webpush: {
                notification: {
                    icon: '/dadexpress.jpeg',
                    badge: '/dadexpress.jpeg',
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    tag: notification.tag || 'general'
                },
                fcmOptions: {
                    link: notification.click_action || '/'
                }
            }
        };

        // FCM imageUrl requires an absolute URL - skip if it's a relative path
        if (notification.image && notification.image.startsWith('http')) {
            message.notification.imageUrl = notification.image;
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
