/**
 * Formats a phone number for display by removing the '91' or '+91' prefix if present.
 * @param {string|number} phone - The phone number to format.
 * @returns {string} The formatted phone number.
 */
export const formatPhone = (phone) => {
  if (!phone) return "";
  let cleaned = phone.toString().trim();
  
  // Remove +91
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3).trim();
  } 
  // Remove 91 if it's longer than 10 digits (to avoid stripping valid 10-digit numbers starting with 91, rare but possible in some countries, but here we assume Indian context)
  else if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(2).trim();
  }
  
  // Also remove any dashes or spaces
  return cleaned.replace(/[-\s]/g, "");
};
