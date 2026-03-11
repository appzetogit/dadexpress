/**
 * Shared utilities for Order ID generation and normalization
 */

/**
 * Normalizes an order ID for robust database lookup.
 * Handles URL encoding, spaces, and formatting inconsistencies.
 * @param {string} id - The raw order ID from request params
 * @returns {string} The normalized order ID (e.g., ORD-123456789)
 */
export function normalizeOrderId(id) {
  if (!id) return "";
  
  try {
    return decodeURIComponent(id)
      .replace(/\s+/g, "") // Remove all whitespace
      .replace(/ORD-?/i, "ORD-") // Standardize prefix to "ORD-"
      .trim();
  } catch (e) {
    // If decoding fails, still try to clean the raw string
    return String(id)
      .replace(/\s+/g, "")
      .replace(/ORD-?/i, "ORD-")
      .trim();
  }
}

/**
 * Generates a strict, URL-safe Order ID.
 * Format: ORD-${timestamp}-${random}
 * @returns {string} Generated Order ID
 */
export function generateOrderId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `ORD-${timestamp}-${random}`;
}
