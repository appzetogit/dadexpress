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

const formatValidImageUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    const baseUrl = (process.env.CORS_ORIGIN || 'https://dadexpress.in').replace(/\/+$/, '');
    const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${baseUrl}${cleanPath}`;
};

class NotificationService {
    /**
     * Send a push notification to a specific device
     * @param {string} token - FCM registration token
     * @param {Object} notification - Notification object { title, body, image }
     * @param {Object} data - Optional data payload
     * @param {string} platform - 'web', 'ios', 'android', 'app'
     */
    async sendPushNotification(token, notification, data = {}, platform = 'web') {
        if (!token || typeof token !== 'string' || token.trim().length === 0 || token === 'undefined' || token === 'null') {
            logger.warn('FCM token is invalid or missing, skipping notification');
            return null;
        }

        const notificationTitle = notification.title || 'DadExpress';
        const notificationBody = notification.body || '';
        const validImageUrl = formatValidImageUrl(notification.image || notification.imageUrl || 'https://dadexpress.in/dadexpress.jpeg');

        // FCM data values must all be strings
        const stringData = {};
        for (const [key, val] of Object.entries(data)) {
            stringData[key] = String(val ?? '');
        }

        const message = {
            token: token.trim(),
            notification: {
                title: notificationTitle,
                body: notificationBody,
                ...(validImageUrl ? { imageUrl: validImageUrl } : {})
            },
            data: {
                ...stringData,
                title: notificationTitle,
                body: notificationBody,
                image: validImageUrl || "",
                click_action: data.click_action || '/'
            },
            android: {
                priority: 'high',
                ttl: 3600000, // 1 hour TTL
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                    sound: 'default',
                    priority: 'high',
                    channelId: 'dadexpress_notifications',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    ...(validImageUrl ? { imageUrl: validImageUrl } : {})
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                },
                payload: {
                    aps: {
                        alert: {
                            title: notificationTitle,
                            body: notificationBody
                        },
                        sound: 'default',
                        badge: 1,
                        'content-available': 1,
                        'mutable-content': 1
                    }
                },
                ...(validImageUrl ? { fcm_options: { image: validImageUrl } } : {})
            },
            webpush: {
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                    ...(validImageUrl ? { icon: validImageUrl, badge: validImageUrl } : {}),
                    vibrate: [200, 100, 200]
                },
                fcmOptions: {
                    link: data.link || data.click_action || '/'
                }
            }
        };

        try {
            const response = await admin.messaging().send(message);
            logger.info('Successfully sent push notification:', response);
            return response;
        } catch (error) {
            const code = error.code;
            if (code === 'messaging/registration-token-not-registered' || 
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/invalid-argument') {
                logger.warn(`FCM token is no longer valid (${token.substring(0, 15)}...), cleaning up from DB`);
                this.cleanupDeadTokens([token]).catch(() => {});
            }
            logger.error('Error sending push notification:', error.code, error.message);
            return null;
        }
    }

    /**
     * Send notification to a list of tokens (multicast)
     */
    async sendMulticastNotification(tokens, notification, data = {}) {
        if (!tokens || tokens.length === 0) return null;

        const cleanTokens = tokens.filter(t => typeof t === 'string' && t.trim().length > 0 && t !== 'undefined' && t !== 'null');
        if (cleanTokens.length === 0) return null;

        const notificationTitle = notification.title || 'DadExpress';
        const notificationBody = notification.body || '';
        const validImageUrl = formatValidImageUrl(notification.image || notification.imageUrl || 'https://dadexpress.in/dadexpress.jpeg');

        // FCM data values must all be strings
        const stringData = {};
        for (const [key, val] of Object.entries(data)) {
            stringData[key] = String(val ?? '');
        }

        const message = {
            tokens: cleanTokens,
            notification: {
                title: notificationTitle,
                body: notificationBody,
                ...(validImageUrl ? { imageUrl: validImageUrl } : {})
            },
            data: {
                ...stringData,
                title: notificationTitle,
                body: notificationBody,
                image: validImageUrl || "",
                click_action: data.click_action || '/'
            },
            android: {
                priority: 'high',
                ttl: 3600000,
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                    sound: 'default',
                    priority: 'high',
                    channelId: 'dadexpress_notifications',
                    defaultSound: true,
                    defaultVibrateTimings: true,
                    ...(validImageUrl ? { imageUrl: validImageUrl } : {})
                }
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert'
                },
                payload: {
                    aps: {
                        alert: {
                            title: notificationTitle,
                            body: notificationBody
                        },
                        sound: 'default',
                        badge: 1,
                        'content-available': 1,
                        'mutable-content': 1
                    }
                },
                ...(validImageUrl ? { fcm_options: { image: validImageUrl } } : {})
            },
            webpush: {
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                    ...(validImageUrl ? { icon: validImageUrl, badge: validImageUrl } : {}),
                    vibrate: [200, 100, 200]
                },
                fcmOptions: {
                    link: notification.click_action || data.click_action || data.link || '/'
                }
            }
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(message);
            logger.info(`[FCM] ${response.successCount}/${cleanTokens.length} messages sent successfully`);

            // Automatically clean up dead tokens from database so future sends are clean and fast!
            if (response.failureCount > 0 && Array.isArray(response.responses)) {
                const deadTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const code = resp.error?.code;
                        if (code === 'messaging/registration-token-not-registered' || 
                            code === 'messaging/invalid-registration-token' ||
                            code === 'messaging/invalid-argument') {
                            deadTokens.push(cleanTokens[idx]);
                        }
                    }
                });
                if (deadTokens.length > 0) {
                    this.cleanupDeadTokens(deadTokens).catch(() => {});
                }
            }

            return response;
        } catch (error) {
            logger.error('[FCM] Error sending multicast notification:', error.code, error.message);
            return null;
        }
    }

    /**
     * Clean up dead/unregistered FCM tokens from User, Delivery, and Restaurant collections
     */
    async cleanupDeadTokens(deadTokens) {
        if (!Array.isArray(deadTokens) || deadTokens.length === 0) return;
        try {
            const { default: User } = await import('../../modules/auth/models/User.js');
            const { default: Delivery } = await import('../../modules/delivery/models/Delivery.js');
            const { default: Restaurant } = await import('../../modules/restaurant/models/Restaurant.js');

            await Promise.allSettled([
                User.updateMany({ fcmToken: { $in: deadTokens } }, { $unset: { fcmToken: "" } }),
                User.updateMany({ fcmTokenMobile: { $in: deadTokens } }, { $unset: { fcmTokenMobile: "" } }),
                Delivery.updateMany({ fcmToken: { $in: deadTokens } }, { $unset: { fcmToken: "" } }),
                Delivery.updateMany({ fcmTokenMobile: { $in: deadTokens } }, { $unset: { fcmTokenMobile: "" } }),
                Restaurant.updateMany({ fcmToken: { $in: deadTokens } }, { $unset: { fcmToken: "" } }),
                Restaurant.updateMany({ fcmTokenMobile: { $in: deadTokens } }, { $unset: { fcmTokenMobile: "" } })
            ]);
            logger.info(`[FCM] Cleaned up ${deadTokens.length} invalid/dead tokens from database.`);
        } catch (err) {
            logger.warn(`[FCM] Failed to cleanup dead tokens: ${err.message}`);
        }
    }
}

export default new NotificationService();
