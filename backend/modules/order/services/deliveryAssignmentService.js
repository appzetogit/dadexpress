import Delivery from '../../delivery/models/Delivery.js';
import Order from '../models/Order.js';
import Zone from '../../admin/models/Zone.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import BusinessSettings from '../../admin/models/BusinessSettings.js';
import mongoose from 'mongoose';
import { generateRoutePolyline } from '../../delivery/services/locationProcessingService.js';
import {
  cacheRouteInRealtime,
  findNearestOnlineDeliveryBoyFromRealtime,
  getCachedRouteFromRealtime,
  syncActiveOrderRealtime
} from '../../delivery/services/firebaseTrackingService.js';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

/**
 * Find all nearest available delivery boys within priority distance (for priority notification)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} priorityDistance - Priority distance in km (default: 5km)
 * @param {number} maxCount - Max number of partners to return
 * @param {Object} order - The order being assigned (optional)
 * @returns {Promise<Array>} Array of delivery boys within priority distance
 */
export async function findNearestDeliveryBoys(restaurantLat, restaurantLng, restaurantId = null, priorityDistance = 5, maxCount = 20, order = null) {
  try {
    console.log(`🔍 Searching for priority delivery partners within ${priorityDistance}km of restaurant: ${restaurantLat}, ${restaurantLng}`);
    
    // Use the same logic as findNearestDeliveryBoy but return all within priority distance
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0]
      }
    };

    if (restaurantId) {
      try {
        const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
        zone = await Zone.findOne({
          restaurantId: restaurantIdObj,
          isActive: true
        }).lean();

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone:`, zoneError.message);
      }
    }

    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 0} online delivery partners`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      return [];
    }

    // Calculate distance and filter
    const wallets = await DeliveryWallet.find({ deliveryId: { $in: deliveryPartners.map(p => p._id) } }).lean();
    const settings = await BusinessSettings.getSettings();
    const totalCashLimit = Math.max(0, Number(settings?.deliveryCashLimit) || 0);

    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        // Cash limit enforcement: skip partners if over-limit AND order is cash
        // Source of truth for payment method is order.payment.method or normalized
        const isCashCandidate = order?.payment?.method?.toLowerCase() === 'cash' || 
                              order?.payment?.method?.toLowerCase() === 'cod' ||
                              order?.paymentMethod === 'cash';

        if (totalCashLimit > 0 && isCashCandidate) {
          const wallet = (wallets || []).find(w => w.deliveryId.toString() === partner._id.toString());
          const cashInHand = Math.max(0, Number(wallet?.cashInHand) || 0);
          
          if (cashInHand >= totalCashLimit) {
             console.log(`🚫 Skipping over-limit partner ${partner.name} for CASH order (Cash: ${cashInHand}, Limit: ${totalCashLimit})`);
             return null;
          }
        }

        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates;
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Zone filtering (same as findNearestDeliveryBoy)
        if (zone) {
          if (partner.zoneId && partner.zoneId.toString() !== zone._id.toString()) {
            return null;
          }
          if (!partner.zoneId && zone.coordinates && zone.coordinates.length >= 3) {
            const zoneCoords = zone.coordinates;
            let inside = false;
            for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
              const xi = zoneCoords[i].longitude;
              const yi = zoneCoords[i].latitude;
              const xj = zoneCoords[j].longitude;
              const yj = zoneCoords[j].latitude;
              const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (!inside) return null;
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= priorityDistance)
      .sort((a, b) => a.distance - b.distance);

    console.log(`✅ Found ${deliveryPartnersWithDistance.length} priority delivery partners within ${priorityDistance}km`);
    return deliveryPartnersWithDistance.map(partner => ({
      deliveryPartnerId: partner._id.toString(),
      name: partner.name,
      phone: partner.phone,
      distance: partner.distance,
      location: {
        latitude: partner.latitude,
        longitude: partner.longitude
      }
    }));
  } catch (error) {
    console.error('❌ Error finding nearest delivery boys:', error);
    return [];
  }
}

/**
 * Find the nearest available delivery boy to a restaurant location (with zone-based filtering)
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @param {string} restaurantId - Restaurant ID (for zone lookup)
 * @param {number} maxDistance - Maximum distance in km (default: 50km)
 * @param {Array} excludeIds - Array of delivery partner IDs to exclude (already notified)
 * @param {Object} order - The order being assigned (optional)
 * @returns {Promise<Object|null>} Nearest delivery boy or null
 */
export async function findNearestDeliveryBoy(restaurantLat, restaurantLng, restaurantId = null, maxDistance = 50, excludeIds = [], order = null) {
  try {
    console.log(`🔍 Searching for nearest delivery partner near restaurant: ${restaurantLat}, ${restaurantLng} (Restaurant ID: ${restaurantId})`);

    // Try Firebase Realtime Database first for nearest rider selection
    try {
      const realtimeNearest = await findNearestOnlineDeliveryBoyFromRealtime(
        restaurantLat,
        restaurantLng,
        maxDistance,
        excludeIds
      );

      if (realtimeNearest?.deliveryPartnerId) {
        const partnerDoc = await Delivery.findById(realtimeNearest.deliveryPartnerId)
          .select('_id name phone')
          .lean();

        if (partnerDoc) {
          console.log(`✅ Found nearest delivery partner from Firebase: ${partnerDoc.name} (${realtimeNearest.distance.toFixed(2)}km)`);
          return {
            deliveryPartnerId: partnerDoc._id.toString(),
            name: partnerDoc.name,
            phone: partnerDoc.phone,
            distance: realtimeNearest.distance,
            location: realtimeNearest.location
          };
        }
      }
    } catch (firebaseNearestError) {
      console.warn(`⚠️ Firebase nearest lookup failed, falling back to Mongo: ${firebaseNearestError.message}`);
    }
    
    // Step 1: Find zone for restaurant (if restaurantId provided)
    let zone = null;
    let deliveryQuery = {
      'availability.isOnline': true,
      status: { $in: ['approved', 'active'] },
      isActive: true,
      'availability.currentLocation.coordinates': {
        $exists: true,
        $ne: [0, 0] // Exclude default/null coordinates
      }
    };

    if (restaurantId) {
      try {
        // Try to find zone by restaurantId
        const restaurantIdObj = restaurantId.toString ? restaurantId.toString() : restaurantId;
        zone = await Zone.findOne({
          restaurantId: restaurantIdObj,
          isActive: true
        }).lean();

        if (zone) {
          console.log(`✅ Found zone: ${zone.name} for restaurant ${restaurantId}`);
          
          // Option A: Filter by zoneId if Delivery model has zoneId field
          // Uncomment when zoneId is added to Delivery model
          // deliveryQuery.zoneId = zone._id;

          // Option B: Filter by geo-spatial query (if zone has boundary)
          // This is more complex and slower, but works without modifying Delivery model
          if (zone.boundary && zone.boundary.coordinates) {
            // For now, we'll use distance-based with zone coordinate check
            // In production, you can use $geoWithin for better accuracy
            console.log(`📍 Zone boundary found, will filter by location after distance calculation`);
          }
        } else {
          console.log(`⚠️ No zone found for restaurant ${restaurantId}, using distance-based assignment`);
        }
      } catch (zoneError) {
        console.warn(`⚠️ Error finding zone for restaurant ${restaurantId}:`, zoneError.message);
        // Continue with distance-based assignment
      }
    }

    // Exclude already notified delivery partners
    if (excludeIds && excludeIds.length > 0) {
      const excludeObjectIds = excludeIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));
      if (excludeObjectIds.length > 0) {
        deliveryQuery._id = { $nin: excludeObjectIds };
        console.log(`🚫 Excluding ${excludeObjectIds.length} already notified delivery partners`);
      }
    }

    // Find all online delivery partners (with zone filter if applicable)
    const deliveryPartners = await Delivery.find(deliveryQuery)
      .select('_id name phone availability.currentLocation availability.lastLocationUpdate status isActive zoneId')
      .lean();

    console.log(`📊 Found ${deliveryPartners?.length || 1} online delivery partners in database`);

    if (!deliveryPartners || deliveryPartners.length === 0) {
      return null;
    }

    // Load wallets and settings for cash limit enforcement
    const onlinePartnerIds = (deliveryPartners || []).map(p => p._id);
    const wallets = (onlinePartnerIds.length > 0) ? await DeliveryWallet.find({ deliveryId: { $in: onlinePartnerIds } }).lean() : [];
    const settings = await BusinessSettings.getSettings();
    const totalCashLimit = Math.max(0, Number(settings?.deliveryCashLimit) || 0);

    // Calculate distance for each delivery partner and filter by zone if applicable
    const deliveryPartnersWithDistance = deliveryPartners
      .map(partner => {
        // Cash limit enforcement: skip partners if over-limit AND order is cash
        const isCashCandidate = order?.payment?.method?.toLowerCase() === 'cash' || 
                              order?.payment?.method?.toLowerCase() === 'cod' ||
                              order?.paymentMethod === 'cash';

        if (totalCashLimit > 0 && isCashCandidate) {
          const wallet = (wallets || []).find(w => w.deliveryId.toString() === partner._id.toString());
          const cashInHand = Math.max(0, Number(wallet?.cashInHand) || 0);
          
          if (cashInHand >= totalCashLimit) {
            console.log(`🚫 Excluding over-limit partner ${partner.name} from CASH order search`);
            return null;
          }
        }

        const location = partner.availability?.currentLocation;
        if (!location || !location.coordinates || location.coordinates.length < 2) {
          return null;
        }

        const [lng, lat] = location.coordinates; // GeoJSON format: [longitude, latitude]
        
        // Skip if coordinates are invalid
        if (lat === 0 && lng === 0) {
          return null;
        }

        // Filter by zone if zone exists
        if (zone) {
          // Option A: Check zoneId match (when zoneId is added to Delivery model)
          if (partner.zoneId && partner.zoneId.toString() !== zone._id.toString()) {
            console.log(`⚠️ Delivery partner ${partner._id} not in zone ${zone.name} (partner zone: ${partner.zoneId}, required zone: ${zone._id})`);
            return null; // Skip delivery partners not in the restaurant's zone
          }

          // Option B: Geo-spatial check (point-in-polygon) if zoneId not available
          // Simple point-in-polygon using ray casting algorithm
          if (!partner.zoneId && zone.coordinates && zone.coordinates.length >= 3) {
            // Zone coordinates: [{ latitude, longitude }, ...]
            const zoneCoords = zone.coordinates;
            let inside = false;
            
            for (let i = 0, j = zoneCoords.length - 1; i < zoneCoords.length; j = i++) {
              const xi = zoneCoords[i].longitude;
              const yi = zoneCoords[i].latitude;
              const xj = zoneCoords[j].longitude;
              const yj = zoneCoords[j].latitude;
              
              const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
              
              if (intersect) inside = !inside;
            }
            
            if (!inside) {
              console.log(`⚠️ Delivery partner ${partner._id} location (${lat}, ${lng}) not within zone ${zone.name} boundary`);
              return null;
            }
          }
        }

        const distance = calculateDistance(restaurantLat, restaurantLng, lat, lng);
        
        return {
          ...partner,
          distance,
          latitude: lat,
          longitude: lng,
          zoneId: partner.zoneId || null
        };
      })
      .filter(partner => partner !== null && partner.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance); // Sort by distance (nearest first)

    if (deliveryPartnersWithDistance.length === 0) {
      console.log(`⚠️ No delivery partners found within ${maxDistance}km`);
      return null;
    }

    // Get the nearest delivery partner
    const nearestPartner = deliveryPartnersWithDistance[0];
    
    console.log(`✅ Found nearest delivery partner: ${nearestPartner.name} (ID: ${nearestPartner._id})`);
    console.log(`✅ Distance: ${nearestPartner.distance.toFixed(2)}km away`);
    console.log(`✅ Location: ${nearestPartner.latitude}, ${nearestPartner.longitude}`);
    console.log(`✅ Phone: ${nearestPartner.phone}`);

    return {
      deliveryPartnerId: nearestPartner._id.toString(),
      name: nearestPartner.name,
      phone: nearestPartner.phone,
      distance: nearestPartner.distance,
      location: {
        latitude: nearestPartner.latitude,
        longitude: nearestPartner.longitude
      }
    };
  } catch (error) {
    console.error('❌ Error finding nearest delivery boy:', error);
    throw error;
  }
}

/**
 * Assign order to nearest delivery boy
 * @param {Object} order - Order document
 * @param {number} restaurantLat - Restaurant latitude
 * @param {number} restaurantLng - Restaurant longitude
 * @returns {Promise<Object|null>} Assignment result or null
 */
export async function assignOrderToDeliveryBoy(order, restaurantLat, restaurantLng, restaurantId = null) {
  try {
    // CRITICAL: Don't assign if order is cancelled
    if (order.status === 'cancelled') {
      console.log(`⚠️ Order ${order.orderId} is cancelled. Cannot assign to delivery partner.`);
      return null;
    }
    
    // CRITICAL: Don't assign if order is already delivered/completed
    if (order.status === 'delivered' || 
        order.deliveryState?.currentPhase === 'completed' ||
        order.deliveryState?.status === 'delivered') {
      console.log(`⚠️ Order ${order.orderId} is already delivered/completed. Cannot assign.`);
      return null;
    }
    
    // Check if order already has a delivery partner assigned
    if (order.deliveryPartnerId) {
      console.log(`⚠️ Order ${order.orderId} already has delivery partner assigned`);
      return null;
    }

    // Get restaurantId from order if not provided
    const orderRestaurantId = restaurantId || order.restaurantId;
    
    // Find nearest delivery boy (with zone-based filtering and cash limit check)
    const nearestDeliveryBoy = await findNearestDeliveryBoy(restaurantLat, restaurantLng, orderRestaurantId, 50, [], order);

    if (!nearestDeliveryBoy) {
      console.log(`⚠️ No delivery boy found for order ${order.orderId}`);
      return null;
    }

    // Update order with delivery partner assignment
    // Note: Don't set outForDelivery yet - that should happen when delivery boy picks up the order
    order.deliveryPartnerId = nearestDeliveryBoy.deliveryPartnerId;
    order.assignmentInfo = {
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      distance: nearestDeliveryBoy.distance,
      assignedAt: new Date(),
      assignedBy: 'nearest_available'
    };
    // Don't set outForDelivery status here - that should be set when delivery boy picks up the order
    // order.tracking.outForDelivery = {
    //   status: true,
    //   timestamp: new Date()
    // };
    
    await order.save();

    // Persist active order tracking in Firebase so clients can reuse the same polyline
    try {
      const customerCoords = order.address?.location?.coordinates?.length >= 2
        ? { lat: order.address.location.coordinates[1], lng: order.address.location.coordinates[0] }
        : null;
      const restaurantCoords = (typeof restaurantLat === 'number' && typeof restaurantLng === 'number')
        ? { lat: restaurantLat, lng: restaurantLng }
        : null;

      let polyline = null;
      let distanceKm = null;
      let durationMin = null;
      if (customerCoords && restaurantCoords) {
        const cachedRoute = await getCachedRouteFromRealtime(restaurantCoords, customerCoords);

        if (cachedRoute?.polyline) {
          polyline = cachedRoute.polyline;
          distanceKm = cachedRoute.distanceKm;
          durationMin = cachedRoute.durationMin;
          console.log(`✅ Using Firebase route_cache for order ${order.orderId}`);
        } else {
          const route = await generateRoutePolyline(
            nearestDeliveryBoy.location || restaurantCoords,
            restaurantCoords,
            customerCoords
          );

          if (route?.polyline) {
            polyline = route.polyline;
            distanceKm = Number(((route.totalDistance || 0) / 1000).toFixed(3));
            durationMin = Number(((route.duration || 0) / 60).toFixed(3));

            await cacheRouteInRealtime(restaurantCoords, customerCoords, {
              polyline,
              distanceKm,
              durationMin
            });
          }
        }
      }

      await syncActiveOrderRealtime({
        orderId: order.orderId || order._id?.toString(),
        boyId: nearestDeliveryBoy.deliveryPartnerId,
        boyLat: nearestDeliveryBoy.location?.latitude,
        boyLng: nearestDeliveryBoy.location?.longitude,
        status: 'assigned',
        polyline,
        restaurant: restaurantCoords,
        customer: customerCoords,
        distanceKm,
        durationMin,
        createdAt: Date.now()
      });
    } catch (firebaseSyncError) {
      console.warn(`⚠️ Failed to sync assigned order to Firebase: ${firebaseSyncError.message}`);
    }

    // Trigger ETA recalculation for rider assigned event
    try {
      const etaEventService = (await import('./etaEventService.js')).default;
      await etaEventService.handleRiderAssigned(order._id.toString(), nearestDeliveryBoy.deliveryPartnerId);
      console.log(`✅ ETA updated after rider assigned to order ${order.orderId}`);
    } catch (etaError) {
      console.error('Error updating ETA after rider assignment:', etaError);
      // Continue even if ETA update fails
    }

    console.log(`✅ Assigned order ${order.orderId} to delivery partner ${nearestDeliveryBoy.name}`);

    return {
      success: true,
      deliveryPartnerId: nearestDeliveryBoy.deliveryPartnerId,
      deliveryPartnerName: nearestDeliveryBoy.name,
      distance: nearestDeliveryBoy.distance,
      orderId: order.orderId
    };
  } catch (error) {
    console.error('❌ Error assigning order to delivery boy:', error);
    throw error;
  }
}
