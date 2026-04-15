import EnvironmentVariable from "../../modules/admin/models/EnvironmentVariable.js";
import { decrypt, isEncrypted } from "./encryption.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Cache for environment variables (cache for 5 minutes)
let envCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get environment variable value from database
 * Falls back to process.env if not found in database
 * Automatically decrypts encrypted values
 * @param {string} key - Environment variable key
 * @param {string} defaultValue - Default value if not found
 * @returns {Promise<string>} Environment variable value (decrypted)
 */
export async function getEnvVar(key, defaultValue = "") {
  try {
    const envVars = await getAllEnvVars();
    let value = envVars[key] || process.env[key] || defaultValue;

    // Decrypt if encrypted (for direct access, toEnvObject already decrypts, but this is a safety check)
    if (value && isEncrypted(value)) {
      try {
        value = decrypt(value);
      } catch (error) {
        logger.warn(`Error decrypting ${key}: ${error.message}`);
        return defaultValue;
      }
    }

    return value;
  } catch (error) {
    logger.warn(
      `Error fetching env var ${key} from database, using process.env: ${error.message}`,
    );
    return process.env[key] || defaultValue;
  }
}

/**
 * Get all environment variables from database
 * Uses caching to reduce database queries
 * @returns {Promise<Object>} Object containing all environment variables
 */
export async function getAllEnvVars() {
  try {
    // Check cache
    const now = Date.now();
    if (envCache && cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
      return envCache;
    }

    // Fetch from database
    const envVars = await EnvironmentVariable.getOrCreate();
    const envData = envVars.toEnvObject();

    // Update cache
    envCache = envData;
    cacheTimestamp = now;

    return envData;
  } catch (error) {
    logger.error(
      `Error fetching environment variables from database: ${error.message}`,
    );
    // Return empty object on error, will fallback to process.env in getEnvVar
    return {};
  }
}

/**
 * Clear environment variables cache
 * Call this after updating environment variables
 */
export function clearEnvCache() {
  envCache = null;
  cacheTimestamp = null;
  logger.info("Environment variables cache cleared");
}

/**
 * Get Razorpay credentials
 * @returns {Promise<Object>} { keyId, keySecret }
 */
export async function getRazorpayCredentials() {
  const apiKey = await getEnvVar("RAZORPAY_API_KEY");
  const secretKey = await getEnvVar("RAZORPAY_SECRET_KEY");

  // Fallback to old env var names
  return {
    keyId: apiKey || process.env.RAZORPAY_KEY_ID || "",
    keySecret: secretKey || process.env.RAZORPAY_KEY_SECRET || "",
  };
}

/**
 * Trim Cloudinary-related strings (quotes, whitespace)
 * @param {string|undefined|null} value
 * @returns {string}
 */
export function normalizeCloudinaryCredential(value) {
  if (value == null || value === "") return "";
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

/**
 * Strip invisible chars and all whitespace from API key/secret (copy-paste from PDF/dashboard often breaks signatures).
 * @param {string|undefined|null} value
 * @returns {string}
 */
export function scrubCloudinaryKeyOrSecret(value) {
  let s = normalizeCloudinaryCredential(value);
  if (!s) return "";
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/\s/g, "");
  return s;
}

/**
 * True if value looks like a real Cloudinary API secret (not UI placeholder text).
 * Invalid secrets in Admin ENV Setup must not override a correct process.env secret.
 * @param {string|undefined|null} secret
 * @returns {boolean}
 */
export function isValidCloudinaryApiSecret(secret) {
  const s = scrubCloudinaryKeyOrSecret(secret);
  if (!s) return false;
  if (s.length < 24) return false;
  const lower = s.toLowerCase().replace(/\s+/g, " ").trim();
  const placeholders = [
    "cloudinary api secret",
    "your api secret",
    "api secret",
    "enter api secret",
    "replace_me",
  ];
  if (placeholders.includes(lower)) return false;
  if (/^(your|enter|replace|todo)[_\s-]/i.test(s)) return false;
  return true;
}

/**
 * Get Cloudinary credentials
 * Never mix cloud_name / api_key / api_secret across sources — that produces HTTP 401 Invalid Signature.
 * Prefer a complete trio from process.env, then a complete trio from the DB (Admin ENV).
 * @returns {Promise<Object>} { cloudName, apiKey, apiSecret, credentialsSource }
 */
export async function getCloudinaryCredentials() {
  const envVars = await getAllEnvVars();
  const dbCloud = normalizeCloudinaryCredential(
    envVars.CLOUDINARY_CLOUD_NAME,
  ).toLowerCase();
  const dbKey = scrubCloudinaryKeyOrSecret(envVars.CLOUDINARY_API_KEY);
  const dbSecret = scrubCloudinaryKeyOrSecret(envVars.CLOUDINARY_API_SECRET);

  const peCloud = normalizeCloudinaryCredential(
    process.env.CLOUDINARY_CLOUD_NAME,
  ).toLowerCase();
  const peKey = scrubCloudinaryKeyOrSecret(process.env.CLOUDINARY_API_KEY);
  const peSecret = scrubCloudinaryKeyOrSecret(process.env.CLOUDINARY_API_SECRET);

  const envBundleComplete =
    Boolean(peCloud) &&
    Boolean(peKey) &&
    isValidCloudinaryApiSecret(peSecret);
  const dbBundleComplete =
    Boolean(dbCloud) &&
    Boolean(dbKey) &&
    isValidCloudinaryApiSecret(dbSecret);

  const force = String(process.env.CLOUDINARY_CREDENTIALS_SOURCE || "")
    .trim()
    .toLowerCase();

  if (force === "env" && envBundleComplete) {
    return {
      cloudName: peCloud,
      apiKey: peKey,
      apiSecret: peSecret,
      credentialsSource: "process.env (forced)",
    };
  }
  if (force === "db" && dbBundleComplete) {
    return {
      cloudName: dbCloud,
      apiKey: dbKey,
      apiSecret: dbSecret,
      credentialsSource: "database (forced)",
    };
  }

  if (envBundleComplete) {
    return {
      cloudName: peCloud,
      apiKey: peKey,
      apiSecret: peSecret,
      credentialsSource: "process.env",
    };
  }
  if (dbBundleComplete) {
    if (!envBundleComplete && (peCloud || peKey || peSecret)) {
      logger.warn(
        "Cloudinary: Admin ENV/DB trio is complete but process.env has partial Cloudinary vars — using database. Set all three in PM2/ecosystem or add CLOUDINARY_CREDENTIALS_SOURCE=env.",
      );
    }
    return {
      cloudName: dbCloud,
      apiKey: dbKey,
      apiSecret: dbSecret,
      credentialsSource: "database",
    };
  }

  return {
    cloudName: peCloud || dbCloud,
    apiKey: peKey || dbKey,
    apiSecret: isValidCloudinaryApiSecret(peSecret)
      ? peSecret
      : isValidCloudinaryApiSecret(dbSecret)
        ? dbSecret
        : peSecret || dbSecret,
    credentialsSource: "partial-fallback",
  };
}

/**
 * Get Firebase credentials
 * @returns {Promise<Object>} Firebase credentials object
 */
export async function getFirebaseCredentials() {
  return {
    apiKey: await getEnvVar("FIREBASE_API_KEY"),
    authDomain: await getEnvVar("FIREBASE_AUTH_DOMAIN"),
    storageBucket: await getEnvVar("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: await getEnvVar("FIREBASE_MESSAGING_SENDER_ID"),
    appId: await getEnvVar("FIREBASE_APP_ID"),
    measurementId: await getEnvVar("MEASUREMENT_ID"),
    projectId: await getEnvVar("FIREBASE_PROJECT_ID"),
    clientEmail: await getEnvVar("FIREBASE_CLIENT_EMAIL"),
    databaseURL: await getEnvVar("FIREBASE_DATABASE_URL"),
    privateKey: await getEnvVar("FIREBASE_PRIVATE_KEY"),
  };
}

/**
 * Get SMTP credentials
 * @returns {Promise<Object>} { host, port, user, pass }
 */
export async function getSMTPCredentials() {
  return {
    host: await getEnvVar("SMTP_HOST"),
    port: await getEnvVar("SMTP_PORT"),
    user: await getEnvVar("SMTP_USER"),
    pass: await getEnvVar("SMTP_PASS"),
  };
}

/**
 * Get SMS Hub India credentials
 * @returns {Promise<Object>} { apiKey, senderId }
 */
export async function getSMSHubIndiaCredentials() {
  return {
    apiKey: await getEnvVar("SMSINDIAHUB_API_KEY"),
    senderId: await getEnvVar("SMSINDIAHUB_SENDER_ID"),
  };
}

/**
 * Get Google Maps API Key
 * @returns {Promise<string>} Google Maps API Key
 */
export async function getGoogleMapsApiKey() {
  const viteKey = await getEnvVar("VITE_GOOGLE_MAPS_API_KEY");
  if (viteKey) return viteKey;
  return await getEnvVar("GOOGLE_MAPS_API_KEY");
}
