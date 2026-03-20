
import { messaging, getToken, onMessage } from '@/lib/firebase';
import api from '../lib/api/axios';

// VAPID key for dad-express
const VAPID_KEY = "BLd26y4PbOmBzFABPEfLNhQAsGDKYVpbyUdk_zKRO0Q5jy7tKOMr7IRuri1tLy6jdtVtevqmdZTs1I-psrM96HM";

const safeStorage = {
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    }
};

// Register service worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('✅ Service Worker registered:', registration);
            return registration;
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            throw error;
        }
    } else {
        throw new Error('Service Workers are not supported');
    }
}

// Request notification permission
async function requestNotificationPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification.requestPermission === 'function') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('✅ Notification permission granted');
            return true;
        } else {
            console.log('❌ Notification permission denied');
            return false;
        }
    }
    return false;
}

// Get FCM token
async function getFCMToken() {
    try {
        console.log('🔄 [FCM Service] Initializing FCM...');
        if (!messaging) {
            return null;
        }
        const registration = await registerServiceWorker();

        // Ensure SW is up to date
        if (registration && registration.update) {
            await registration.update();
        }

        // Check if permission granted
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
            console.log('⚠️ [FCM Service] Notification permission not granted yet. Requesting...');
            const granted = await requestNotificationPermission();
            if (!granted) {
                console.warn('❌ [FCM Service] Notification permission denied by user.');
                return null;
            }
        }

        console.log('🔑 [FCM Service] Requesting FCM token...');

        try {
            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (token) {
                console.log('✅ [FCM Service] FCM Token obtained successfully');
                return token;
            } else {
                console.warn('❌ [FCM Service] No FCM token returned.');
                return null;
            }
        } catch (tokenError) {
            console.error('❌ [FCM Service] Error during getToken:', tokenError);
            return null;
        }
    } catch (error) {
        console.error('❌ [FCM Service] Fatal error getting FCM token:', error);
        return null;
    }
}

// Helper to detect platform
function getPlatform() {
    return 'web';
}

// Register FCM token with backend
async function registerFCMToken(authType = 'user') {
    try {
        // Get token from Firebase
        const token = await getFCMToken();
        if (!token) return;

        console.log(`🚀 [FCM Service] Sending token to backend for ${authType}`);

        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const platform = getPlatform();

        // Standard dad-express endpoint for updating FCM token - using our universal API client
        const response = await api.put('/auth/update-fcm-token', {
            fcmToken: token,
            platform: platform
        });

        console.log(`✅ [FCM Service] Backend response:`, response.data);
        safeStorage.setItem(`fcm_token_synced`, 'true');
        return token;
    } catch (error) {
        console.error(`❌ [FCM Service] Error registering FCM token:`, error.response?.data || error.message);
    }
}


// Listen for messages from the service worker (like instructions to play audio)
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PLAY_NOTIFICATION_SOUND') {
            console.log('🔊 [Client] Playing notification sound as requested by SW');
            try {
                const audio = new Audio(event.data.audioUrl || '/audio/alert.mp3');
                // The browser might block auto-play if there was no user interaction
                audio.play().catch(e => console.warn('Could not play audio from SW message (might need user interaction):', e));
            } catch (e) {
                console.warn('Error playing audio from SW message:', e);
            }
        }
    });
}

let isForegroundHandlerSetup = false;

// Setup foreground notification handler
function setupForegroundNotificationHandler(handler) {
    if (isForegroundHandlerSetup) return;
    if (!messaging) return;

    try {
        onMessage(messaging, (payload) => {
            console.log('📬 [FCM Service] Foreground message received:', payload);

        // Show proper full-size Windows/Chrome OS desktop notification via service worker
            if ('serviceWorker' in navigator && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                navigator.serviceWorker.ready.then((registration) => {
                const title = payload.notification?.title || payload.data?.title || 'DadExpress';
                const body = payload.notification?.body || payload.data?.body || payload.data?.message || '';

                registration.showNotification(title, {
                    body: body,
                    icon: '/dadexpress.jpeg',
                    badge: '/dadexpress.jpeg',
                    vibrate: [200, 100, 200],
                    tag: payload.data?.tag || payload.data?.orderId || 'general',
                    renotify: true,
                    requireInteraction: true,
                    data: { url: payload.data?.click_action || '/' }
                });
                });
            }

        // Call custom handler (like toast)
            if (handler) {
                handler(payload);
            }
        });
    } catch (error) {
        console.warn('[FCM Service] Foreground handler setup skipped:', error?.message || error);
        return;
    }

    isForegroundHandlerSetup = true;
}

export {
    registerFCMToken,
    setupForegroundNotificationHandler,
    requestNotificationPermission,
    getFCMToken,
    getPlatform
};
