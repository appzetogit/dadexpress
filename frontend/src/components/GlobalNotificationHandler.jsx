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

        // Setup foreground message handler (with bakalacart-style deduplication logic inside service)
        setupForegroundNotificationHandler((payload) => {
            console.log('[GlobalNotificationHandler] Foreground message for UI:', payload);

            // Still show a toast as a secondary UI feedback
            const title = payload.notification?.title || payload.data?.title || 'New Notification';
            const body = payload.notification?.body || payload.data?.body || payload.data?.message || '';
            const icon = '/dadexpress.jpeg';

            toast.custom((t) => (
                <div className="flex bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden max-w-sm w-full pointer-events-auto">
                    <div className="flex-shrink-0 w-2 bg-blue-500"></div>
                    <div className="flex items-center gap-3 p-4">
                        <img src={icon} alt="Notification" className="w-10 h-10 object-contain rounded-full bg-slate-100" />
                        <div>
                            <p className="text-sm font-bold text-slate-800">{title}</p>
                            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{body}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => toast.dismiss(t)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                    >
                        ×
                    </button>
                </div>
            ), { duration: 5000 });
        });

        initPush();

    }, []);

    return null;
}
