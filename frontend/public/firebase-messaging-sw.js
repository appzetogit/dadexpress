importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyABoUSSx4Z63LoC0vR4xCIruCV_SZvykgc",
    authDomain: "dad-express.firebaseapp.com",
    databaseURL: "https://dad-express-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dad-express",
    storageBucket: "dad-express.firebasestorage.app",
    messagingSenderId: "210018822653",
    appId: "1:210018822653:web:8d3b2845d6803e48d41194",
    measurementId: "G-4ZZY5KMHVM"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Function to tell clients to play notification sound
async function playNotificationSound() {
    try {
        console.log('🔊 [SW] Attempting to ask clients to play notification sound');
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
            client.postMessage({
                type: 'PLAY_NOTIFICATION_SOUND',
                audioUrl: '/audio/alert.mp3'
            });
        }
    } catch (error) {
        console.warn('[SW] Could not send play sound message to clients:', error);
    }
}

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    // Play sound for orders (if audio file exists)
    const isOrderNotif = payload.data?.type?.includes('order') || payload.data?.orderId;
    if (isOrderNotif) {
        playNotificationSound();
    }

    const title = payload.notification?.title || payload.data?.title || 'DadExpress';
    const body = payload.notification?.body || payload.data?.body || payload.data?.message || '';
    const icon = self.location.origin + '/dadexpress.jpeg';
    const tag = payload.data?.tag || payload.data?.orderId || 'general';

    // Show OS-level Chrome notification
    return self.registration.showNotification(title, {
        body,
        icon,
        badge: icon,
        vibrate: [200, 100, 200],
        tag: tag, // Deduplication
        renotify: true,
        requireInteraction: true,
        data: {
            url: payload.data?.click_action || payload.fcmOptions?.link || '/',
        }
    });
});

// Handle notification click — open the app
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
