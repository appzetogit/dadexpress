import Offer from '../models/Offer.js';
import Restaurant from '../models/Restaurant.js';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

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

  // Debug: Check all offers for this restaurant
  const allRestaurantOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
  })
    .select('items discountType minOrderValue startDate endDate status')
    .lean();
  
  console.log(`[COUPONS] Total active offers for restaurant: ${allRestaurantOffers.length}`);
  allRestaurantOffers.forEach(offer => {
    console.log(`[COUPONS] Offer ${offer._id} has ${offer.items?.length || 0} items`);
    offer.items?.forEach((item, idx) => {
      console.log(`[COUPONS]   Item ${idx}: itemId=${item.itemId}, couponCode=${item.couponCode}`);
    });
  });

  const offerSelect =
    'items discountType minOrderValue maxLimit startDate endDate status customerGroup';

  const itemSpecificOffers = await Offer.find({
    restaurant: restaurantId,
    status: 'active',
    'items.itemId': itemId,
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
    
    console.log(`[COUPONS] Offer ${offer._id}:`);
    console.log(`  startDate: ${startDate?.toISOString()}, now: ${now.toISOString()}, startValid: ${startValid}`);
    console.log(`  endDate: ${endDate?.toISOString()}, now: ${now.toISOString()}, endValid: ${endValid}`);
    
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
    console.log(`[COUPONS] Processing offer ${offer._id} with ${offer.items?.length || 0} items`);
    offer.items.forEach((item, idx) => {
      const general = isGeneralCouponItem(item);
      console.log(
        `[COUPONS]   Item ${idx}: itemId="${item.itemId}", searching for="${itemId}", general=${general}, match=${item.itemId === itemId}`,
      );
      if (general || item.itemId === itemId) {
        const coupon = {
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
        };
        console.log(`[COUPONS]   ✅ Adding coupon:`, coupon);
        coupons.push(coupon);
      }
    });
  });

  console.log(`[COUPONS] ✅ Returning ${coupons.length} coupons for itemId ${itemId}`);
  console.log(`[COUPONS] Coupons array:`, JSON.stringify(coupons, null, 2));

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

    const restaurant = await Restaurant.findOne(restaurantQuery).select('_id isActive').lean();

    if (restaurant) {
      if (!restaurant.isActive) {
        console.log(`[COUPONS-PUBLIC] Restaurant found but not active: ${restaurantId}`);
        return successResponse(res, 200, 'Restaurant is currently inactive', {
          coupons: [],
          total: 0,
        });
      }
      restaurantObjectId = restaurant._id;
      console.log(`[COUPONS-PUBLIC] Found restaurant with _id: ${restaurantObjectId}`);
    } else {
      console.log(`[COUPONS-PUBLIC] Restaurant not found for ID: ${restaurantId}`);
      return successResponse(res, 200, 'No coupons found', {
        coupons: [],
        total: 0,
      });
    }
  } catch (error) {
    console.error(`[COUPONS-PUBLIC] Error finding restaurant:`, error);
    return errorResponse(res, 500, `Error finding restaurant: ${error.message}`);
  }

  const offerSelectPublic =
    'items discountType minOrderValue maxLimit startDate endDate status customerGroup';

  const itemSpecificOffers = await Offer.find({
    restaurant: restaurantObjectId,
    status: 'active',
    'items.itemId': itemId,
  })
    .select(offerSelectPublic)
    .lean();

  const generalOffers = await Offer.find({
    restaurant: restaurantObjectId,
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
    .select(offerSelectPublic)
    .lean();

  const offerById = new Map();
  [...itemSpecificOffers, ...generalOffers].forEach((o) => {
    offerById.set(String(o._id), o);
  });
  const allOffers = Array.from(offerById.values());

  console.log(
    `[COUPONS-PUBLIC] Found ${allOffers.length} active offers (item + restaurant-wide) for itemId ${itemId} for restaurant ${restaurantId}`,
  );

  // Filter by date validity
  const validOffers = allOffers.filter(offer => {
    const startDate = offer.startDate ? new Date(offer.startDate) : null;
    const endDate = offer.endDate ? new Date(offer.endDate) : null;
    
    const startValid = !startDate || startDate <= now;
    const endValid = !endDate || endDate >= now;
    
    return startValid && endValid;
  });

  console.log(`[COUPONS-PUBLIC] Found ${validOffers.length} valid offers after date filtering`);

  const isGeneralCouponItem = (item) =>
    item == null ||
    item.itemId == null ||
    item.itemId === '' ||
    String(item.itemId).toUpperCase() === 'N/A';

  const coupons = [];
  validOffers.forEach(offer => {
    offer.items.forEach(item => {
      const general = isGeneralCouponItem(item);
      if (general || item.itemId === itemId) {
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

  console.log(`[COUPONS-PUBLIC] Returning ${coupons.length} coupons for itemId ${itemId}`);

  return successResponse(res, 200, 'Coupons retrieved successfully', {
    coupons,
    total: coupons.length,
  });
});

// Get all active offers with restaurant and dish details (PUBLIC - for user offers page)
export const getPublicOffers = asyncHandler(async (req, res) => {
  try {
    console.log('[PUBLIC-OFFERS] Request received');
    const now = new Date();
    
    // Find all active offers
    const offers = await Offer.find({
      status: 'active',
    })
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

