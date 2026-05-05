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
  
  // 1. Try GeoJSON coordinates array [lng, lat] from location object
  if (Array.isArray(entity.location?.coordinates) && entity.location.coordinates.length >= 2) {
    const [lng, lat] = entity.location.coordinates;
    if (lng !== 0 || lat !== 0) return [lng, lat];
  }
  
  // 2. Try coordinates array [lng, lat] or [lat, lng] directly on object
  if (Array.isArray(entity.coordinates) && entity.coordinates.length >= 2) {
    const [c1, c2] = entity.coordinates;
    // Check if it's [lng, lat]
    if (Math.abs(c1) <= 180 && Math.abs(c2) <= 90) {
       if (c1 !== 0 || c2 !== 0) return [c1, c2];
    }
    // Check if it's [lat, lng]
    if (Math.abs(c1) <= 90 && Math.abs(c2) <= 180) {
       if (c1 !== 0 || c2 !== 0) return [c2, c1];
    }
  }
  
  // 3. Try latitude/longitude properties
  const lat = entity.location?.latitude ?? entity.location?.lat ?? entity.lat ?? entity.latitude;
  const lng = entity.location?.longitude ?? entity.location?.lng ?? entity.lng ?? entity.longitude;
  
  if (typeof lat === 'number' && typeof lng === 'number' && (lat !== 0 || lng !== 0)) {
    // Basic validation
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return [lng, lat];
    }
  }
  
  return null;
};

export const calculateDeliveryFee = async (orderValue, restaurant, deliveryAddress = null, deliveryFleet = 'standard') => {
  const feeSettings = await getFeeSettings();
  const freeDeliveryThreshold = Number(feeSettings?.freeDeliveryThreshold ?? 149);

  // 1) GLOBAL FREE-DELIVERY THRESHOLD (Primary)
  // Apply global free-delivery threshold before any other logic.
  // Threshold 0 is treated as disabled.
  if (freeDeliveryThreshold > 0 && Number(orderValue || 0) >= freeDeliveryThreshold) {
    console.log(`[PRICING] Free delivery applied by threshold: orderValue=${orderValue}, threshold=${freeDeliveryThreshold}`);
    return 0;
  }

  // 2) RANGE-BASED DELIVERY FEE (Secondary)
  // Check if admin has configured specific fees based on order value ranges
  if (feeSettings.deliveryFeeRanges && Array.isArray(feeSettings.deliveryFeeRanges) && feeSettings.deliveryFeeRanges.length > 0) {
    const sortedRanges = [...feeSettings.deliveryFeeRanges].sort((a, b) => a.min - b.min);
    for (const range of sortedRanges) {
      if (orderValue >= range.min && (range.max === null || range.max === undefined || orderValue <= range.max)) {
        console.log(`[PRICING] Using Range-based delivery fee: ₹${range.fee} for subtotal ${orderValue}`);
        return Number(range.fee);
      }
    }
  }

  // 3) DISTANCE-BASED DELIVERY FEE (Tertiary - Fallback if no specific ranges match)
  // Check if distance is available for dynamic calculation
  const restaurantCoordinates = extractCoordinates(restaurant);
  const deliveryCoordinates = extractCoordinates(deliveryAddress);
  let distanceKm = null;

  if (restaurantCoordinates && deliveryCoordinates) {
    distanceKm = calculateDistance(restaurantCoordinates, deliveryCoordinates);
    console.log(`[PRICING] Calculated distance: ${distanceKm} km`);
  }

  // Fallback to provided distance strings if coordinates extraction fails
  if ((distanceKm === null || distanceKm <= 0) && (restaurant?.distance || restaurant?.deliveryDistance)) {
    const distStr = String(restaurant.distance || restaurant.deliveryDistance || '');
    const parsedDist = parseFloat(distStr.replace(/[^\d.]/g, ''));
    if (!isNaN(parsedDist)) {
      distanceKm = parsedDist;
      console.log(`[PRICING] Fallback distance from metadata: ${distanceKm} km`);
    }
  }

  // If we have a valid distance, try using the DeliveryBoyCommission rules as a dynamic fee
  if (distanceKm !== null && !isNaN(distanceKm) && distanceKm >= 0) {
    try {
      const commissionInfo = await DeliveryBoyCommission.calculateCommission(distanceKm);
      if (commissionInfo && commissionInfo.commission > 0) {
        console.log(`[PRICING] Using dynamic distance fee: ₹${commissionInfo.commission}`);
        return Math.max(0, Math.round(commissionInfo.commission * 100) / 100);
      }
    } catch (err) {
      console.warn(`[PRICING] Dynamic distance fee calculation failed:`, err.message);
    }
  }

  // 4) FINAL FALLBACK: Base Fee + Per-KM Charge
  console.log('[PRICING] All specific logic failed, falling back to base fee settings');
  const baseFee = Number(feeSettings.deliveryFee || 25);
  const perKmCharge = getPerKmDeliveryCharge(feeSettings, restaurant, deliveryAddress);

  const finalFallbackFee = roundCurrency(baseFee + perKmCharge);
  console.log(`[PRICING] Final fallback result: base=${baseFee}, kmCharge=${perKmCharge}, total=${finalFallbackFee}`);
  return finalFallbackFee;
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
  
  // Combine both percentage fields to be safe, as admin labels can be confusing
  const totalPercentage = Number(feeSettings?.platformFeePercentage || 0) + 
                          Number(feeSettings?.platformCommissionPercent || 0);
  
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
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);

          const offer = await Offer.findOne({
            restaurant: restaurantObjectId,
            status: 'active',
            'items.couponCode': couponCode,
            startDate: { $lte: now },
            $or: [
              { endDate: { $gte: now } },
              { 
                // Handle cases where endDate was set to beginning of today (00:00:00)
                // by allowing it to be valid until the end of that day.
                endDate: { $gte: startOfToday },
                $expr: { 
                  $and: [
                    { $eq: [{ $hour: "$endDate" }, 0] },
                    { $eq: [{ $minute: "$endDate" }, 0] }
                  ]
                }
              },
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

    // Fetch all settings once at the very beginning to ensure consistency across all sub-calculations
    const feeSettings = await getFeeSettings();

    // 1. Calculate Delivery Fee (Honoring threshold first)
    const orderValue = Number(subtotal) || 0;
    const threshold = Number(feeSettings.freeDeliveryThreshold ?? 149);
    
    let baseDeliveryFee = 0;
    if (threshold > 0 && orderValue >= threshold) {
      baseDeliveryFee = 0;
    } else {
      // Fallback to calculation if not free
      baseDeliveryFee = await calculateDeliveryFee(
        subtotal,
        restaurant,
        deliveryAddress,
        deliveryFleet
      );
    }

    // Apply free delivery from coupon
    const finalDeliveryFee = appliedCoupon?.freeDelivery ? 0 : baseDeliveryFee;

    // 2. Calculate Platform Fee (Ensure it's not zero if admin settings have a value)
    const fixedPlatformFee = Number(feeSettings.platformFee || 0);
    const platformPercentage = Number(feeSettings.platformFeePercentage || 0) + Number(feeSettings.platformCommissionPercent || 0);
    const platformFee = roundCurrency(fixedPlatformFee + (subtotal * platformPercentage) / 100);

    // 3. Calculate GST
    const gstRate = Number(feeSettings.gstRate || 5) / 100;
    const gst = roundCurrency((subtotal - discount) * gstRate);

    // 4. Referral coins redemption
    let referralDiscount = 0;
    if (useReferralCoins && userId) {
      const User = (await import('../../auth/models/User.js')).default;
      const user = await User.findById(userId).lean();

      if (user && user.wallet?.balance > 0) {
        const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
        const businessSettings = await BusinessSettings.getSettings();

        if (businessSettings?.referral?.isEnabled) {
          const maxRedemptionPercentage = businessSettings.referral.maxRedemptionPercentage || 20;
          const currentTotalBeforeCoins = subtotal - discount + finalDeliveryFee + platformFee + gst;
          const maxCoinsAllowed = Math.floor((currentTotalBeforeCoins * maxRedemptionPercentage) / 100);

          // Use either requested coins or available balance, capped at max allowed
          const coinsRequested = coinsToUse || user.wallet.balance;
          referralDiscount = Math.min(user.wallet.balance, maxCoinsAllowed, coinsRequested);
        }
      }
    }

    // 5. Aggregate Totals
    const totalAmount = subtotal + finalDeliveryFee + platformFee + gst;
    const total = subtotal - discount + finalDeliveryFee + platformFee + gst - referralDiscount;
    const savings = discount + (baseDeliveryFee > finalDeliveryFee ? baseDeliveryFee - finalDeliveryFee : 0) + referralDiscount;

    const result = {
      subtotal: roundCurrency(subtotal),
      discount: roundCurrency(discount),
      deliveryFee: roundCurrency(finalDeliveryFee),
      baseDeliveryFee: roundCurrency(baseDeliveryFee),
      platformFee: roundCurrency(platformFee),
      tax: roundCurrency(gst),
      total: roundCurrency(total),
      savings: roundCurrency(savings),
      referralDiscount: roundCurrency(referralDiscount),
      isFreeDelivery: finalDeliveryFee === 0,
      breakdown: {
        deliveryFee: finalDeliveryFee,
        platformFee: platformFee,
        gst: gst
      }
    };

    // DEBUG: Log breakdown to catch the ₹2606 glitch
    if (total > 500 && items.length <= 2) {
      console.warn('⚠️ High order total detected in backend calculation:', {
        orderId: restaurantId, // using restaurantId as context
        pricing: result,
        itemCount: items.length,
        items: items.map(i => ({ id: i.itemId, price: i.price, qty: i.quantity }))
      });
    }

    return {
      subtotal: roundCurrency(subtotal),
      discount: roundCurrency(discount),
      referralDiscount: roundCurrency(referralDiscount),
      deliveryFee: roundCurrency(finalDeliveryFee),
      baseDeliveryFee: roundCurrency(baseDeliveryFee),
      platformFee: roundCurrency(platformFee),
      platformFeePercentage: Number(feeSettings?.platformFeePercentage || 0),
      tax: roundCurrency(gst),
      total: Math.max(0, roundCurrency(total)),
      totalAmount: Math.max(0, roundCurrency(totalAmount)),
      savings: roundCurrency(savings),
      isFreeDelivery: finalDeliveryFee === 0,
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
