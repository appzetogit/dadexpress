import { useEffect } from 'react';
import { registerFCMToken, setupForegroundNotificationHandler } from '@/services/pushNotificationService';
import { toast } from 'sonner';

export default function GlobalNotificationHandler() {
    useEffect(() => {
        // Auto-refresh/register FCM token for logged-in users (per module)
        const initPush = async () => {
            try {
                const path = window.location?.pathname || "";

                // User auth pages पर रहते हुए FCM token register करने की कोशिश नहीं करेंगे
                // ताकि unauthorized update-fcm-token calls से reload / redirect loop न बने
                const isUserAuthRoute =
                    path === "/auth/sign-in" ||
                    path.startsWith("/auth/") ||
                    path.startsWith("/user/auth/");

                if (isUserAuthRoute) {
                    return;
                }

                // Current path से module decide करें और उसी module का token check करें
                let tokenKey = "user_accessToken";

                if (path.startsWith("/admin")) {
                    tokenKey = "admin_accessToken";
                } else if (path.startsWith("/delivery")) {
                    tokenKey = "delivery_accessToken";
                } else if (path.startsWith("/restaurant") && !path.startsWith("/restaurants")) {
                    tokenKey = "restaurant_accessToken";
                } else {
                    tokenKey = "user_accessToken";
                }

                // User module के लिए legacy accessToken भी fallback के रूप में allow करें
                let hasModuleToken = localStorage.getItem(tokenKey);
                if (!hasModuleToken && tokenKey === "user_accessToken") {
                    hasModuleToken = localStorage.getItem("accessToken");
                }

                // अगर current module के लिए token ही नहीं है तो FCM register की जरूरत नहीं
                if (!hasModuleToken) {
                    return;
                }

                await registerFCMToken();
                console.log(
                    "[GlobalNotificationHandler] Push notifications registered successfully",
                );
            } catch (err) {
                console.warn(
                    "[GlobalNotificationHandler] Initialization warning:",
                    err.message,
                );
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
