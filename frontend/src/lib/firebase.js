import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';

// Firebase configuration - fallback to hardcoded values if env vars are not available
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyABoUSSx4Z63LoC0vR4xCIruCV_SZvykgc",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "dad-express.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://dad-express-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "dad-express",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "dad-express.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "210018822653",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:210018822653:web:8d3b2845d6803e48d41194",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-4ZZY5KMHVM"
};

// Validate Firebase configuration
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field] || firebaseConfig[field] === 'undefined');

if (missingFields.length > 0) {
  console.error('Firebase configuration is missing required fields:', missingFields);
  console.error('Current config:', firebaseConfig);
  throw new Error(`Firebase configuration error: Missing fields: ${missingFields.join(', ')}`);
}

// Initialize Firebase app only once
let app;
let firebaseAuth;
let googleProvider;
let messaging;

// Function to ensure Firebase is initialized
function ensureFirebaseInitialized() {
  try {
    const existingApps = getApps();
    if (existingApps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log('Firebase initialized successfully');
    } else {
      app = existingApps[0];
    }

    // Initialize Auth
    if (!firebaseAuth) {
      firebaseAuth = getAuth(app);
    }

    // Initialize Google Provider
    if (!googleProvider) {
      googleProvider = new GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
    }

    // Initialize Messaging (only in browser)
    if (!messaging && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        messaging = getMessaging(app);
      } catch (err) {
        console.warn('Firebase Messaging not supported in this browser', err);
      }
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
}

// Initialize immediately
ensureFirebaseInitialized();

/**
 * Request FCM Token
 */
export const requestFcmToken = async () => {
  if (typeof window === 'undefined') return null;

  try {
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[PUSH-NOTIFICATION] Permission not granted for notifications');
      return null;
    }

    // Use the dad-express VAPID key for proper FCM token generation
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BLd26y4PbOmBzFABPEfLNhQAsGDKYVpbyUdk_zKRO0Q5jy7tKOMr7IRuri1tLy6jdtVtevqmdZTs1I-psrM96HM';

    let token = null;
    try {
      token = await getToken(messaging, { vapidKey });
      console.log('[PUSH-NOTIFICATION] FCM Token generated with VAPID key');
    } catch (fallbackErr) {
      console.error('[PUSH-NOTIFICATION] Token generation failed:', fallbackErr);
    }

    if (token) {
      console.log('[PUSH-NOTIFICATION] FCM Token:', token);
      return token;
    } else {
      console.warn('[PUSH-NOTIFICATION] No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (error) {
    console.error('[PUSH-NOTIFICATION] Error getting FCM token:', error);
    return null;
  }
};

/**
 * Listen for foreground messages
 */
export const onForegroundMessage = (callback) => {
  if (messaging) {
    return onMessage(messaging, (payload) => {
      console.log('[PUSH-NOTIFICATION] Foreground message received:', payload);
      if (callback) callback(payload);
    });
  }
};

export const firebaseApp = app;
export {
  firebaseAuth,
  googleProvider,
  messaging,
  getToken,
  onMessage,
  deleteToken,
  ensureFirebaseInitialized
};


