/**
 * Normalize phone number by removing spaces, dashes, and other formatting characters
 * Normalizes to consistent format: digits only, with country code for Indian numbers.
 *
 * Note:
 * - This function intentionally returns digits-only (no leading '+') because a lot of
 *   existing data and indexes rely on that format.
 * - If you need E.164 (e.g. +91XXXXXXXXXX), use `normalizePhoneNumberE164`.
 * @param {string} phone - Phone number to normalize
 * @returns {string|null} - Normalized phone number or null if invalid
 */
export const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Remove all non-digit characters (including +)
  const digitsOnly = phone.trim().replace(/\D/g, '');
  
  // If it's empty after cleaning, return null
  if (!digitsOnly) {
    return null;
  }
  
  // Handle Indian phone numbers (most common case)
  // If it's 10 digits, assume it's Indian and add country code 91
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  
  // If it's 11 digits and starts with 0, remove leading 0 and add 91
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `91${digitsOnly.substring(1)}`;
  }
  
  // If it's 12 digits and starts with 91, return as is
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly;
  }
  
  // For other lengths, return as is (could be other country codes)
  return digitsOnly;
};

/**
 * Normalize phone number to an E.164-ish format: "+<digits>".
 * For Indian 10-digit inputs, this produces +91XXXXXXXXXX.
 *
 * This stays intentionally conservative (no advanced country parsing) to avoid
 * breaking existing flows. It is meant to be a consistent storage/compare format.
 *
 * @param {string} phone
 * @returns {string|null}
 */
export const normalizePhoneNumberE164 = (phone) => {
  const digitsOnly = normalizePhoneNumber(phone);
  if (!digitsOnly) return null;
  return `+${digitsOnly}`;
};

/**
 * Build a list of possible stored representations for a phone number.
 * Helps with backward compatibility (old 10-digit records, "+91..." etc).
 *
 * @param {string} phone
 * @returns {string[]} unique variants
 */
export const getPhoneNumberVariants = (phone) => {
  const normalizedDigits = normalizePhoneNumber(phone);
  if (!normalizedDigits) return [];

  const variants = new Set();
  variants.add(normalizedDigits);
  variants.add(`+${normalizedDigits}`);

  // India-specific backwards compat: allow storing without country code as 10 digits.
  if (normalizedDigits.startsWith('91') && normalizedDigits.length === 12) {
    const withoutCountryCode = normalizedDigits.substring(2);
    variants.add(withoutCountryCode);
    variants.add(`+91${withoutCountryCode}`);
  } else if (normalizedDigits.length === 10) {
    // If someone stored without country code, also check with it.
    variants.add(`91${normalizedDigits}`);
    variants.add(`+91${normalizedDigits}`);
  }

  return Array.from(variants);
};

/**
 * Convenience helper to build a Mongo query for a phone field.
 *
 * @param {string} phone
 * @param {string} field - Document field name to query (default: "phone")
 * @returns {object|null}
 */
export const buildPhoneInQuery = (phone, field = 'phone') => {
  const variants = getPhoneNumberVariants(phone);
  if (!variants.length) return null;
  return { [field]: { $in: variants } };
};
