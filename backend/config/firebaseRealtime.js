import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const REALTIME_APP_NAME = 'realtime-tracking';
let realtimeDb = null;
let initialized = false;
const isRealtimeEnabled = process.env.FIREBASE_REALTIME_ENABLED === 'true';

function resolveServiceAccountFromFile() {
  const configPath = path.resolve(
    process.cwd(),
    'config',
    'dad-express-firebase-adminsdk-fbsvc-b5eadad2f5.json'
  );
  const rootPath = path.resolve(process.cwd(), 'firebaseconfig.json');

  const targetPath = fs.existsSync(configPath)
    ? configPath
    : fs.existsSync(rootPath)
      ? rootPath
      : null;

  if (!targetPath) return null;

  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key
    };
  } catch (error) {
    console.warn(`⚠️ Failed to read Firebase service account file: ${error.message}`);
    return null;
  }
}

function resolveFirebaseCredentials() {
  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  const fileCreds = resolveServiceAccountFromFile();
  if (fileCreds) {
    projectId = projectId || fileCreds.projectId;
    clientEmail = clientEmail || fileCreds.clientEmail;
    privateKey = privateKey || fileCreds.privateKey;
  }

  const cleanValue = (val) => {
    if (!val || typeof val !== 'string') return val;
    let v = val.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1).trim();
    }
    return v;
  };

  projectId = cleanValue(projectId);
  clientEmail = cleanValue(clientEmail);
  privateKey = cleanValue(privateKey);

  if (privateKey && privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return { projectId, clientEmail, privateKey, databaseURL };
}

export function initializeFirebaseRealtime() {
  if (initialized && realtimeDb) {
    return realtimeDb;
  }

  if (!isRealtimeEnabled) {
    console.warn('⚠️ Firebase Realtime Database disabled via FIREBASE_REALTIME_ENABLED env flag.');
    return null;
  }

  const { projectId, clientEmail, privateKey, databaseURL } = resolveFirebaseCredentials();

  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    console.warn('⚠️ Firebase Realtime Database not initialized. Missing FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY/FIREBASE_DATABASE_URL.');
    return null;
  }

  try {
    let app;
    try {
      app = admin.app(REALTIME_APP_NAME);
    } catch {
      app = admin.initializeApp(
        {
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
          }),
          databaseURL
        },
        REALTIME_APP_NAME
      );
    }

    realtimeDb = admin.database(app);
    initialized = true;
    console.log('✅ Firebase Realtime Database initialized');
    return realtimeDb;
  } catch (error) {
    console.warn(`⚠️ Firebase Realtime Database not initialized. ${error.message}`);
    realtimeDb = null;
    initialized = false;
    return null;
  }
}

export function getFirebaseRealtimeDb() {
  if (!realtimeDb) {
    throw new Error('⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.');
  }
  return realtimeDb;
}

export function isFirebaseRealtimeAvailable() {
  return Boolean(realtimeDb);
}
