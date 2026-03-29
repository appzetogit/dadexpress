import Restaurant from '../../restaurant/models/Restaurant.js';
import Offer from '../../restaurant/models/Offer.js';
import FeeSettings from '../../admin/models/FeeSettings.js';
import DeliveryBoyCommission from '../../admin/models/DeliveryBoyCommission.js';
import mongoose from 'mongoose';

/**
 * Get active fee settings from database
 * Returns default values if no settings found
 */
const getFeeSettings = async () => {
  try {
    const feeSettings = await FeeSettings.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    if (feeSettings) {
      return feeSettings;
    }

    // Return default values if no active settings found
    return {
      deliveryFee: 25,
      deliveryFeePerKm: 0,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      platformFeePercentage: 0,
      platformCommissionPercent: 0,
      gstRate: 5,
    };
  } catch (error) {
    console.error('Error fetching fee settings:', error);
    // Return default values on error
    return {
      deliveryFee: 25,
      deliveryFeePerKm: 0,
      freeDeliveryThreshold: 149,
      platformFee: 5,
      platformFeePercentage: 0,
      platformCommissionPercent: 0,
      gstRate: 5,
    };
  }
};

const roundCurrency = (value) => Math.round((Number(value) || 0) * 100) / 100;

const getPerKmDeliveryCharge = (feeSettings, restaurant, deliveryAddress) => {
  const perKmRate = Number(feeSettings?.deliveryFeePerKm || 0);
  if (perKmRate <= 0) return 0;

  // Use robust extraction for coordinates
  const restaurantCoordinates = extractCoordinates(restaurant);
  const deliveryCoordinates = extractCoordinates(deliveryAddress);

  let distanceKm = null;
  if (restaurantCoordinates && deliveryCoordinates) {
    distanceKm = calculateDistance(restaurantCoordinates, deliveryCoordinates);
  }

  // Fallback to restaurant.distance if coordinates are missing but distance is available
  if ((distanceKm === null || distanceKm <= 0) && (restaurant?.distance || restaurant?.deliveryDistance)) {
      const distStr = String(restaurant.distance || restaurant.deliveryDistance || '');
      const parsedDist = parseFloat(distStr.replace(/[^\d.]/g, ''));
      if (!isNaN(parsedDist)) distanceKm = parsedDist;
  }

  if (distanceKm === null || isNaN(distanceKm) || distanceKm <= 0) {
      console.warn('[PRICING] Could not determine distance for delivery fee calculation');
      return 0;
  }

  return roundCurrency(distanceKm * perKmRate);
};

/**
 * Calculate delivery fee based on order value, distance, and restaurant settings
 */
/**
 * Helper to safely extract [longitude, latitude] from various coordinate formats
 */
const extractCoordinates = (entity) => {
  if (!entity) return null;
  
  // 1. Try GeoJSON coordinates array [lng, lat]
  if (Array.isArray(entity.location?.coordinates) && entity.location.coordinates.length >= 2) {
    return entity.location.coordinates;
  }
  if (Array.isArray(entity.coordinates) && entity.coordinates.length >= 2) {
    return entity.coordinates;
  }
  
  // 2. Try latitude/longitude properties
  const lat = entity.location?.latitude ?? entity.location?.lat ?? entity.lat ?? entity.latitude;
  const lng = entity.location?.longitude ?? entity.location?.lng ?? entity.lng ?? entity.longitude;
  
  if (typeof lat === 'number' && typeof lng === 'number' && lat !== 0 && lng !== 0) {
    return [lng, lat];
  }
  
  return null;
};

export const calculateDeliveryFee = async (orderValue, restaurant, deliveryAddress = null, deliveryFleet = 'standard') => {
  const feeSettings = await getFeeSettings();

  // 1) Determine Base Delivery Fee (via order value ranges OR default base fee)
  let baseFee = Number(feeSettings.deliveryFee || 25);

  if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
    const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min);
    for (const range of sortedRanges) {
      if (orderValue >= range.min && orderValue <= range.max) {
        baseFee = Number(range.fee);
        break; // Stop at first match
      }
    }
  }

  // 2) Calculate Per-KM Dynamic Charge (Added ON TOP of the base fee)
  // Distance is calculated using coordinates of restaurant and delivery address.
  const perKmCharge = getPerKmDeliveryCharge(feeSettings, restaurant, deliveryAddress);

  // 3) Final calculation: Base + KM charge
  return roundCurrency(baseFee + perKmCharge);
};

/**
 * Calculate platform fee
 */
export const calculatePlatformFeeFromPercentage = (subtotal = 0, percentage = 0) => {
  const safeSubtotal = Number(subtotal) || 0;
  const safePercentage = Number(percentage) || 0;
  if (safeSubtotal <= 0 || safePercentage <= 0) return 0;
  return roundCurrency((safeSubtotal * safePercentage) / 100);
};

export const calculatePlatformFee = async (subtotal = 0) => {
  const feeSettings = await getFeeSettings();
  const fixedFee = Number(feeSettings?.platformFee || 0);
  const totalPercentage = Number(feeSettings?.platformFeePercentage || 0);
  
  const percentageFee = calculatePlatformFeeFromPercentage(subtotal, totalPercentage);
  return roundCurrency(fixedFee + percentageFee);
};

/**
 * Calculate GST (Goods and Services Tax)
 * GST is calculated on subtotal after discounts
 */
export const calculateGST = async (subtotal, discount = 0) => {
  const taxableAmount = subtotal - discount;
  const feeSettings = await getFeeSettings();
  const gstRate = (feeSettings.gstRate || 5) / 100; // Convert percentage to decimal
  return roundCurrency(taxableAmount * gstRate);
};

/**
 * Calculate discount based on coupon code
 */
export const calculateDiscount = (coupon, subtotal) => {
  if (!coupon) return 0;

  if (coupon.minOrder && subtotal < coupon.minOrder) {
    return 0; // Minimum order not met
  }

  if (coupon.type === 'percentage') {
    const maxDiscount = coupon.maxDiscount || Infinity;
    const discount = Math.min(
      Math.round(subtotal * (coupon.discount / 100)),
      maxDiscount
    );
    return discount;
  } else if (coupon.type === 'flat') {
    return Math.min(coupon.discount, subtotal); // Can't discount more than subtotal
  }

  // Default: flat discount
  return Math.min(coupon.discount || 0, subtotal);
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

/**
 * Main function to calculate order pricing
 */
export const calculateOrderPricing = async ({
  items,
  restaurantId,
  deliveryAddress = null,
  couponCode = null,
  deliveryFleet = 'standard',
  userId = null,
  useReferralCoins = false,
  coinsToUse = null
}) => {
  try {
    // Calculate subtotal from items
    const subtotal = items.reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);

    if (subtotal <= 0) {
      throw new Error('Order subtotal must be greater than 0');
    }

    // Get restaurant details
    let restaurant = null;
    if (restaurantId) {
      if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
        restaurant = await Restaurant.findById(restaurantId).lean();
      }
      if (!restaurant) {
        restaurant = await Restaurant.findOne({
          $or: [
            { restaurantId: restaurantId },
            { slug: restaurantId }
          ]
        }).lean();
      }
    }

    // Calculate coupon discount
    let discount = 0;
    let appliedCoupon = null;

    if (couponCode && restaurant) {
      try {
        // Get restaurant ObjectId
        let restaurantObjectId = restaurant._id;
        if (!restaurantObjectId && mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
          restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);
        }

        if (restaurantObjectId) {
          const now = new Date();

          // Find active offer with this coupon code for this restaurant
          const offer = await Offer.findOne({
            restaurant: restaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now },
            $or: [
              { endDate: { $gte: now } },
              { endDate: null }
            ]
          }).lean();

          if (offer) {
            // Find the specific item coupon
            const couponItem = offer.items.find(item => item.couponCode === couponCode);

            if (couponItem) {
              const minOrderMet = !offer.minOrderValue || subtotal >= offer.minOrderValue;

              if (minOrderMet) {
                // Check if it's a general restaurant coupon (no itemId) or tied to items in cart
                const isGeneral = !couponItem.itemId;
                const cartItemIds = items.map(item => item.itemId);
                const isValidForCart = isGeneral || (couponItem.itemId && cartItemIds.includes(couponItem.itemId));

                if (isValidForCart) {
                  if (isGeneral) {
                    // Calculate discount for general coupon
                    if (offer.discountType === 'percentage') {
                      const discountPercentage = couponItem.discountPercentage || 0;
                      discount = Math.round(subtotal * (discountPercentage / 100));
                      if (offer.maxLimit) {
                        discount = Math.min(discount, offer.maxLimit);
                      }
                    } else if (offer.discountType === 'flat-price') {
                      // For general coupons, flat price is the discount amount directly
                      discount = couponItem.discountedPrice || 0;
                      discount = Math.min(discount, subtotal);
                    }
                  } else {
                    // Tied to a specific item
                    const itemInCart = items.find(item => item.itemId === couponItem.itemId);
                    if (itemInCart) {
                      const itemQuantity = itemInCart.quantity || 1;
                      const discountPerItem = (couponItem.originalPrice || 0) - (couponItem.discountedPrice || 0);
                      discount = Math.round(discountPerItem * itemQuantity);
                      const itemSubtotal = (itemInCart.price || 0) * itemQuantity;
                      discount = Math.min(discount, itemSubtotal);
                    }
                  }

                  appliedCoupon = {
                    code: couponCode,
                    discount: discount,
                    discountPercentage: couponItem.discountPercentage,
                    minOrder: offer.minOrderValue || 0,
                    type: offer.discountType === 'percentage' ? 'percentage' : 'flat',
                    itemId: couponItem.itemId,
                    itemName: couponItem.itemName,
                    isGeneral,
                  };
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching coupon from database: ${error.message}`);
        // Continue without coupon if there's an error
      }
    }

    // Calculate delivery fee
    const deliveryFee = await calculateDeliveryFee(
      subtotal,
      restaurant,
      deliveryAddress,
      deliveryFleet
    );

    // Apply free delivery from coupon
    const finalDeliveryFee = appliedCoupon?.freeDelivery ? 0 : deliveryFee;

    // Calculate platform fee based on configured settings (Fixed + Percentage).
    const feeSettings = await getFeeSettings();
    const fixedPlatformFee = Number(feeSettings?.platformFee || 0);
    const platformFeePercentage = Number(feeSettings?.platformFeePercentage || 0);
    
    const percentagePlatformFee = calculatePlatformFeeFromPercentage(subtotal, platformFeePercentage);
    const platformFee = roundCurrency(fixedPlatformFee + percentagePlatformFee);

    // Calculate GST on subtotal after discount
    const gst = await calculateGST(subtotal, discount);

    // Calculate referral coins redemption
    let referralDiscount = 0;
    if (useReferralCoins && userId) {
      const User = (await import('../../auth/models/User.js')).default;
      const user = await User.findById(userId).lean();

      if (user && user.wallet?.balance > 0) {
        const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
        const settings = await BusinessSettings.getSettings();

        if (settings?.referral?.isEnabled) {
          const maxRedemptionPercentage = settings.referral.maxRedemptionPercentage || 20;
          const currentTotalBeforeCoins = subtotal - discount + finalDeliveryFee + platformFee + gst;
          const maxCoinsAllowed = Math.floor((currentTotalBeforeCoins * maxRedemptionPercentage) / 100);

          // Use either requested coins or available balance, capped at max allowed
          const coinsRequested = coinsToUse || user.wallet.balance;
          referralDiscount = Math.min(user.wallet.balance, maxCoinsAllowed, coinsRequested);
        }
      }
    }

    // Gross total before any discount/rewards (additive field, keeps existing total behavior intact).
    const totalAmount = subtotal + finalDeliveryFee + platformFee + gst;

    // Calculate total
    const total = subtotal - discount + finalDeliveryFee + platformFee + gst - referralDiscount;

    // Calculate savings (discount + any delivery savings + referral coins used)
    const savings = discount + (deliveryFee > finalDeliveryFee ? deliveryFee - finalDeliveryFee : 0) + referralDiscount;

    return {
      subtotal: roundCurrency(subtotal),
      discount: roundCurrency(discount),
      referralDiscount: roundCurrency(referralDiscount),
      deliveryFee: roundCurrency(finalDeliveryFee),
      platformFee: roundCurrency(platformFee),
      platformFeePercentage,
      tax: gst, // Already using roundCurrency in calculateGST
      total: Math.max(0, roundCurrency(total)),
      totalAmount: Math.max(0, roundCurrency(totalAmount)),
      savings: roundCurrency(savings),
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      appliedCoupon: appliedCoupon ? {
        code: appliedCoupon.code,
        discount: roundCurrency(discount),
        freeDelivery: appliedCoupon.freeDelivery || false
      } : null,
      breakdown: {
        itemTotal: roundCurrency(subtotal),
        discountAmount: roundCurrency(discount),
        deliveryFee: roundCurrency(finalDeliveryFee),
        platformFee: roundCurrency(platformFee),
        gst: gst,
        total: roundCurrency(total)
      }
    };
  } catch (error) {
    throw new Error(`Failed to calculate order pricing: ${error.message}`);
  }
};
