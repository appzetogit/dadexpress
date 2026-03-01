import { useEffect } from 'react';
import { registerFCMToken, setupForegroundNotificationHandler } from '@/services/pushNotificationService';
import { toast } from 'sonner';

export default function GlobalNotificationHandler() {
    useEffect(() => {
        // Auto-refresh/register FCM token for logged-in users
        const initPush = async () => {
            try {
                // Check if user is logged in
                const hasUserToken = localStorage.getItem('userAccessToken') ||
                    localStorage.getItem('accessToken');

                if (hasUserToken) {
                    await registerFCMToken();
                    console.log('[GlobalNotificationHandler] Push notifications registered successfully');
                }
            } catch (err) {
                console.warn('[GlobalNotificationHandler] Initialization warning:', err.message);
            }
        };

        // Setup foreground message handler (OS-level notifications are handled in the service)
        setupForegroundNotificationHandler((payload) => {
            console.log('[GlobalNotificationHandler] Foreground message received:', payload);
        });

        initPush();

    }, []);

    return null;
}
