import Offer from '../models/Offer.js';
import Restaurant from '../models/Restaurant.js';
import Zone from '../../admin/models/Zone.js';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

/**
 * Check if a point is within a zone polygon using ray casting algorithm
 */
function isPointInZone(lat, lng, zoneCoordinates) {
  if (!zoneCoordinates || zoneCoordinates.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = zoneCoordinates.length - 1; i < zoneCoordinates.length; j = i++) {
    const coordI = zoneCoordinates[i];
    const coordJ = zoneCoordinates[j];
    
    const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
    const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
    const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
    const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;
    
    if (xi === null || yi === null || xj === null || yj === null) continue;
    
    const intersect = ((yi > lng) !== (yj > lng)) && 
                     (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Create/Activate offer
export const createOffer = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  
  const {
    goalId,
    discountType,
    items = [],
    customerGroup = 'all',
    offerPreference = 'all',
    offerDays = 'all',
    startDate,
    endDate,
    targetMealtime = 'all',
    minOrderValue = 0,
    maxLimit = null,
    discountCards = [],
    priceCards = [],
    discountConstruct = '',
    freebieItems = [],
  } = req.body;

  // Validate required fields
  if (!goalId || !discountType) {
    return errorResponse(res, 400, 'goalId and discountType are required');
  }

  // For percentage discounts, items are required
  if (discountType === 'percentage' && (!items || items.length === 0)) {
    return errorResponse(res, 400, 'At least one item is required for percentage discount');
  }

  // Validate each item has required fields
  if (items.length > 0) {
    for (const item of items) {
      if (!item.itemId || !item.itemName || item.originalPrice === undefined || 
          item.discountPercentage === undefined || !item.couponCode) {
        return errorResponse(res, 400, 'Each item must have itemId, itemName, originalPrice, discountPercentage, and couponCode');
      }
    }
  }

  // Create offer
  const offerData = {
    restaurant: restaurantId,
    goalId,
    discountType,
    items,
    customerGroup,
    offerPreference,
    offerDays,
    targetMealtime,
    minOrderValue,
    maxLimit,
    discountCards,
    priceCards,
    discountConstruct,
    freebieItems,
    status: 'active', // Automatically activate
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? (() => {
      const d = new Date(endDate);
      // If time is not specified (00:00:00), set to end of day
      if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
        d.setHours(23, 59, 59, 999);
      }
      return d;
    })() : null,
  };

  const offer = await Offer.create(offerData);

  return successResponse(res, 201, 'Offer created and activated successfully', {
    offer,
  });
});

// Get all offers for restaurant
export const getOffers = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { status, goalId, discountType } = req.query;

  const query = { restaurant: restaurantId };
  
  if (status) {
    query.status = status;
  }
  
  if (goalId) {
    query.goalId = goalId;
  }
  
  if (discountType) {
    query.discountType = discountType;
  }

  const offers = await Offer.find(query)
    .sort({ createdAt: -1 })
    .lean();

  return successResponse(res, 200, 'Offers retrieved successfully', {
    offers,
    total: offers.length,
  });
});

// Get offer by ID
export const getOfferById = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  const offer = await Offer.findOne({
    _id: id,
    restaurant: restaurantId,
  }).lean();

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, 'Offer retrieved successfully', {
    offer,
  });
});

// Update offer status (activate, pause, cancel)
export const updateOfferStatus = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['active', 'paused', 'cancelled'].includes(status)) {
    return errorResponse(res, 400, 'Valid status (active, paused, cancelled) is required');
  }

  const offer = await Offer.findOneAndUpdate(
    {
      _id: id,
      restaurant: restaurantId,
    },
    { status },
    { new: true }
  );

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, `Offer ${status} successfully`, {
    offer,
  });
});

// Delete offer
export const deleteOffer = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { id } = req.params;

  const offer = await Offer.findOneAndDelete({
    _id: id,
    restaurant: restaurantId,
  });

  if (!offer) {
    return errorResponse(res, 404, 'Offer not found');
  }

  return successResponse(res, 200, 'Offer deleted successfully');
});

// Get coupons for a specific item/dish
export const getCouponsByItemId = asyncHandler(async (req, res) => {
  const restaurantId = req.restaurant._id;
  const { itemId } = req.params;

  console.log(`[COUPONS] Request received for itemId: ${itemId}, restaurantId: ${restaurantId}`);

  if (!itemId) {
    return errorResponse(res, 400, 'Item ID is required');
  }

  const now = new Date();
  console.log(`[COUPONS] Current date: ${now.toISOString()}`);

  // Support variation item IDs (e.g., "itemId-variation") by also checking base itemId
  const baseItemId = itemId.includes('-') ? itemId.split('-')[0] : itemId;

  const offerSelect =
    'items discountType minOrderValue maxLimit startDate endDate status customerGroup';

  const itemSpecificOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
    $or: [
      { 'items.itemId': itemId },
      { 'items.itemId': baseItemId }
    ],
  })
    .select(offerSelect)
    .lean();

  const generalOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
    items: {
      $elemMatch: {
        couponCode: { $exists: true, $nin: [null, ''] },
        $or: [
          { itemId: { $exists: false } },
          { itemId: null },
          { itemId: '' },
        ],
      },
    },
  })
    .select(offerSelect)
    .lean();

  const offerById = new Map();
  [...itemSpecificOffers, ...generalOffers].forEach((o) => {
    offerById.set(String(o._id), o);
  });
  const allOffers = Array.from(offerById.values());

  console.log(
    `[COUPONS] Found ${allOffers.length} active offers (item + restaurant-wide) for itemId ${itemId}`,
  );

  // Filter by date validity
  const validOffers = allOffers.filter(offer => {
    const startDate = offer.startDate ? new Date(offer.startDate) : null;
    const endDate = offer.endDate ? new Date(offer.endDate) : null;
    
    // Start date should be <= now (or null)
    const startValid = !startDate || startDate <= now;
    
    // End date should be >= now (or null)
    const endValid = !endDate || endDate >= now;
    
    return startValid && endValid;
  });

  console.log(`[COUPONS] Found ${validOffers.length} valid offers after date filtering`);

  const isGeneralCouponItem = (item) =>
    item == null ||
    item.itemId == null ||
    item.itemId === '' ||
    String(item.itemId).toUpperCase() === 'N/A';

  // Extract coupons for this specific item + restaurant-wide (admin) coupons
  const coupons = [];
  validOffers.forEach(offer => {
    offer.items.forEach(item => {
      const general = isGeneralCouponItem(item);
      // Support matching baseItemId for variations
      if (general || item.itemId === itemId || item.itemId === baseItemId) {
        coupons.push({
          couponCode: item.couponCode,
          discountPercentage: item.discountPercentage,
          originalPrice: item.originalPrice,
          discountedPrice: item.discountedPrice,
          minOrderValue: offer.minOrderValue || 0,
          discountType: offer.discountType,
          startDate: offer.startDate,
          endDate: offer.endDate,
          maxLimit: offer.maxLimit,
          isGeneral: general,
        });
      }
    });
  });

  console.log(`[COUPONS] ✅ Returning ${coupons.length} coupons for itemId ${itemId}`);

  return successResponse(res, 200, 'Coupons retrieved successfully', {
    coupons,
    total: coupons.length,
  });
});


// Get coupons for a specific item/dish (PUBLIC - for user cart)
export const getCouponsByItemIdPublic = asyncHandler(async (req, res) => {
  const { itemId, restaurantId } = req.params;

  console.log(`[COUPONS-PUBLIC] Request received for itemId: ${itemId}, restaurantId: ${restaurantId}`);

  if (!itemId || !restaurantId) {
    return errorResponse(res, 400, 'Item ID and Restaurant ID are required');
  }

  const now = new Date();
  console.log(`[COUPONS-PUBLIC] Current date: ${now.toISOString()}`);

  // Find restaurant by ID, slug, or restaurantId to get the actual MongoDB _id
  let restaurantObjectId = null;
  
  // Try to find restaurant first
  try {
    const restaurantQuery = {};
    
    // Check if restaurantId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      restaurantQuery._id = new mongoose.Types.ObjectId(restaurantId);
    } else {
      // Try restaurantId field or slug
      restaurantQuery.$or = [
        { restaurantId: restaurantId },
        { slug: restaurantId },
      ];
    }

    console.log(`[COUPONS-PUBLIC] Querying restaurant with:`, JSON.stringify(restaurantQuery));
    const restaurant = await Restaurant.findOne(restaurantQuery).select('_id isActive name restaurantId slug').lean();

    if (restaurant) {
      restaurantObjectId = restaurant._id;
      console.log(`[COUPONS-PUBLIC] Found restaurant: ${restaurant.name} (_id: ${restaurantObjectId}, active: ${restaurant.isActive})`);
    } else {
      console.log(`[COUPONS-PUBLIC] Restaurant NOT found for ID: ${restaurantId}`);
      // Try fallback if restaurantId looks like an ObjectId
      if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
        restaurantObjectId = new mongoose.Types.ObjectId(restaurantId);
        console.log(`[COUPONS-PUBLIC] Using restaurantId as fallback ObjectId: ${restaurantObjectId}`);
      } else {
        return successResponse(res, 200, 'Restaurant not found', { coupons: [], total: 0 });
      }
    }
  } catch (error) {
    console.error(`[COUPONS-PUBLIC] Error finding restaurant:`, error);
    return errorResponse(res, 500, `Error finding restaurant: ${error.message}`);
  }

  const baseItemId = itemId.includes('-') ? itemId.split('-')[0] : itemId;
  console.log(`[COUPONS-PUBLIC] Item search: itemId=${itemId}, baseItemId=${baseItemId}, now=${now.toISOString()}`);

  // Find all offers for this restaurant (including inactive ones for debugging)
  const allOffers = await Offer.find({
    restaurant: restaurantObjectId,
  }).lean();

  console.log(`[COUPONS-PUBLIC] Total offers found in DB for this restaurant: ${allOffers.length}`);

  const isGeneralCouponItem = (item) =>
    item == null ||
    item.itemId == null ||
    item.itemId === '' ||
    String(item.itemId).toUpperCase() === 'N/A' ||
    String(item.itemId).toLowerCase() === 'all';

  const coupons = [];
  const seenCodes = new Set();

  allOffers.forEach(offer => {
    // Detailed logging for each offer
    const isStatusActive = offer.status === 'active';
    const startDate = offer.startDate ? new Date(offer.startDate) : null;
    const endDate = offer.endDate ? new Date(offer.endDate) : null;
    
    // TIMEZONE BUFFER: Allow coupons starting within the next 24 hours 
    // to account for server/client timezone differences (e.g. UTC vs IST)
    const startValid = !startDate || startDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endValid = !endDate || endDate >= now;

    console.log(`[COUPONS-PUBLIC] Checking Offer ${offer._id}: status=${offer.status}, start=${startDate?.toISOString()}, end=${endDate?.toISOString()}, active=${isStatusActive}, datesValid=${startValid && endValid}`);

    if (!isStatusActive) return;
    if (!startValid || !endValid) return;

    offer.items.forEach(item => {
      const general = isGeneralCouponItem(item);
      const itemMatch = String(item.itemId) === String(itemId) || String(item.itemId) === String(baseItemId);
      
      console.log(`[COUPONS-PUBLIC]   - Item: code=${item.couponCode}, itemId=${item.itemId}, general=${general}, itemMatch=${itemMatch}`);

      if (general || itemMatch) {
        if (!seenCodes.has(item.couponCode)) {
          coupons.push({
            couponCode: item.couponCode,
            discountPercentage: Number(item.discountPercentage) || 0,
            originalPrice: item.originalPrice,
            discountedPrice: item.discountedPrice,
            minOrderValue: offer.minOrderValue || 0,
            discountType: offer.discountType,
            startDate: offer.startDate,
            endDate: offer.endDate,
            maxLimit: offer.maxLimit,
            isGeneral: general,
            offerName: offer.name || offer.goalId,
          });
          seenCodes.add(item.couponCode);
          console.log(`[COUPONS-PUBLIC]   ✅ Added coupon: ${item.couponCode}`);
        }
      }
    });
  });

  console.log(`[COUPONS-PUBLIC] Final returning count: ${coupons.length}`);

  return successResponse(res, 200, 'Coupons retrieved successfully', {
    coupons,
    total: coupons.length,
  });
});


// Get all active offers with restaurant and dish details (PUBLIC - for user offers page)
export const getPublicOffers = asyncHandler(async (req, res) => {
  try {
    console.log('[PUBLIC-OFFERS] Request received');
    const { zoneId } = req.query;
    const now = new Date();

    const query = { status: 'active' };

    // Filter restaurants by zone strictly (default to empty list if zoneId is missing or invalid)
    let restaurantIdsInZone = [];
    if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
      const userZone = await Zone.findById(zoneId).lean();
      if (userZone && userZone.coordinates) {
        // Find all active restaurants
        const allRestaurants = await Restaurant.find({ isActive: true }).select('location').lean();
        // Filter those inside the zone
        restaurantIdsInZone = allRestaurants
          .filter(r => {
            const lat = r.location?.latitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
            const lng = r.location?.longitude || (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
            return isPointInZone(lat, lng, userZone.coordinates);
          })
          .map(r => r._id);
      }
    }
    
    query.restaurant = { $in: restaurantIdsInZone };
    
    // Find active offers based on our query
    const offers = await Offer.find(query)
      .populate('restaurant', 'name restaurantId slug profileImage rating estimatedDeliveryTime distance isActive')
      .sort({ createdAt: -1 })
      .lean();
    
    console.log(`[PUBLIC-OFFERS] Found ${offers.length} active offers`);

    // Filter by date validity and flatten to show dishes with offers
    const offerDishes = [];
    
    offers.forEach((offer) => {
      // Check if offer is valid (date-wise)
      const startDate = offer.startDate ? new Date(offer.startDate) : null;
      const endDate = offer.endDate ? new Date(offer.endDate) : null;
      
      const startValid = !startDate || startDate <= now;
      const endValid = !endDate || endDate >= now;
      
      if (!startValid || !endValid) {
        return; // Skip expired or not yet started offers
      }

      // Skip if restaurant is not found or not active
      if (!offer.restaurant || !offer.restaurant.name || offer.restaurant.isActive === false) {
        return;
      }

      // Process each item in the offer
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item) => {
          // Format offer text based on discount type
          let offerText = '';
          if (offer.discountType === 'percentage') {
            offerText = `Flat ${item.discountPercentage}% OFF`;
          } else if (offer.discountType === 'flat-price') {
            const discountAmount = item.originalPrice - item.discountedPrice;
            offerText = `Flat ₹${Math.round(discountAmount)} OFF`;
          } else if (offer.discountType === 'bogo') {
            offerText = 'Buy 1 Get 1 Free';
          } else {
            offerText = 'Special Offer';
          }

          offerDishes.push({
            id: `${offer._id}_${item.itemId}`,
            restaurantId: offer.restaurant._id.toString(),
            restaurantName: offer.restaurant.name,
            restaurantSlug: offer.restaurant.slug || offer.restaurant.name.toLowerCase().replace(/\s+/g, '-'),
            restaurantImage: offer.restaurant.profileImage?.url || '',
            restaurantRating: offer.restaurant.rating || 0,
            deliveryTime: offer.restaurant.estimatedDeliveryTime || '25-30 mins',
            distance: offer.restaurant.distance || '1.2 km',
            dishId: item.itemId,
            dishName: item.itemName,
            dishImage: item.image || '',
            originalPrice: item.originalPrice,
            discountedPrice: item.discountedPrice,
            discountPercentage: item.discountPercentage,
            offer: offerText,
            couponCode: item.couponCode,
            isVeg: item.isVeg || false,
            minOrderValue: offer.minOrderValue || 0,
          });
        });
      }
    });

    // Group by offer text for the "FLAT 50% OFF" section
    const groupedByOffer = {};
    const groupedByRestaurant = {};

    offerDishes.forEach((dish) => {
      // Group by Offer
      if (!groupedByOffer[dish.offer]) {
        groupedByOffer[dish.offer] = [];
      }
      groupedByOffer[dish.offer].push(dish);

      // Group by Restaurant for the new UI structure
      if (!groupedByRestaurant[dish.restaurantId]) {
        groupedByRestaurant[dish.restaurantId] = {
          id: dish.restaurantId,
          name: dish.restaurantName,
          slug: dish.restaurantSlug,
          image: dish.restaurantImage,
          rating: dish.restaurantRating,
          deliveryTime: dish.deliveryTime,
          distance: dish.distance,
          menuItems: []
        };
      }
      
      // Add dish to restaurant's menu items if not already added
      if (groupedByRestaurant[dish.restaurantId].menuItems.length < 15) {
        groupedByRestaurant[dish.restaurantId].menuItems.push({
          id: dish.dishId,
          name: dish.dishName,
          price: dish.discountedPrice,
          originalPrice: dish.originalPrice,
          image: dish.dishImage,
          isVeg: dish.isVeg,
          offer: dish.offer,
          couponCode: dish.couponCode
        });
      }
    });

    console.log(`[PUBLIC-OFFERS] Returning ${offerDishes.length} offer dishes`);
    
    return successResponse(res, 200, 'Offers retrieved successfully', {
      allOffers: offerDishes,
      groupedByOffer,
      groupedByRestaurant: Object.values(groupedByRestaurant),
      total: offerDishes.length,
    });
  } catch (error) {
    console.error('[PUBLIC-OFFERS] Error fetching public offers:', error);
    console.error('[PUBLIC-OFFERS] Error stack:', error.stack);
    return errorResponse(res, 500, error.message || 'Failed to fetch offers');
  }
});

