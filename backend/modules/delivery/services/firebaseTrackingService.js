import { getFirebaseRealtimeDb, isFirebaseRealtimeAvailable } from '../../../config/firebaseRealtime.js';

function toSafeKey(id) {
  return String(id || '').trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function shouldWarnRealtimeUnavailable() {
  return process.env.FIREBASE_REALTIME_ENABLED === 'true';
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function syncDeliveryPartnerRealtime({
  deliveryPartnerId,
  lat,
  lng,
  isOnline = false
}) {
  if (!isFirebaseRealtimeAvailable()) {
    if (shouldWarnRealtimeUnavailable()) {
      console.warn('⚠️ Firebase Realtime Database not available');
    }
    return false;
  }

  const partnerId = toSafeKey(deliveryPartnerId);
  const latitude = toNumber(lat);
  const longitude = toNumber(lng);
  if (!partnerId) return false;

  const db = getFirebaseRealtimeDb();
  const payload = {
    status: isOnline ? 'online' : 'offline',
    last_updated: Date.now()
  };

  if (latitude !== null && longitude !== null) {
    payload.lat = latitude;
    payload.lng = longitude;
  }

  await db.ref(`delivery_boys/${partnerId}`).update(payload);
  return true;
}

export async function syncActiveOrderRealtime({
  orderId,
  boyId = null,
  boyLat,
  boyLng,
  status = 'assigned',
  polyline = null,
  restaurant = null,
  customer = null,
  distanceKm = null,
  durationMin = null,
  createdAt = null
}) {
  if (!isFirebaseRealtimeAvailable()) {
    if (shouldWarnRealtimeUnavailable()) {
      console.warn('⚠️ Firebase Realtime Database not available');
    }
    return false;
  }

  const id = toSafeKey(orderId);
  if (!id) return false;

  const db = getFirebaseRealtimeDb();
  const updates = {
    status,
    last_updated: Date.now()
  };

  const latitude = toNumber(boyLat);
  const longitude = toNumber(boyLng);
  if (latitude !== null && longitude !== null) {
    updates.boy_lat = latitude;
    updates.boy_lng = longitude;
  }

  if (boyId) updates.boy_id = String(boyId);
  if (typeof polyline === 'string' && polyline.trim()) updates.polyline = polyline;
  if (restaurant?.lat != null && restaurant?.lng != null) {
    updates.restaurant_lat = toNumber(restaurant.lat);
    updates.restaurant_lng = toNumber(restaurant.lng);
  }
  if (customer?.lat != null && customer?.lng != null) {
    updates.customer_lat = toNumber(customer.lat);
    updates.customer_lng = toNumber(customer.lng);
  }

  if (distanceKm !== null && distanceKm !== undefined) {
    const d = toNumber(distanceKm);
    if (d !== null) updates.distance = d;
  }
  if (durationMin !== null && durationMin !== undefined) {
    const t = toNumber(durationMin);
    if (t !== null) updates.duration = t;
  }
  if (createdAt !== null && createdAt !== undefined) {
    const ts = toNumber(createdAt);
    if (ts !== null) updates.created_at = ts;
  }

  await db.ref(`active_orders/${id}`).update(updates);
  return true;
}

function normalizeForCacheKey(value) {
  const num = toNumber(value);
  if (num === null) return null;
  const rounded = Math.round(num * 10000) / 10000;
  let text = rounded.toFixed(4);
  text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text.replace('-', 'm').replace('.', '_');
}

export function buildRouteCacheKey(restaurant, customer) {
  if (!restaurant || !customer) return null;
  const parts = [
    normalizeForCacheKey(restaurant.lat),
    normalizeForCacheKey(restaurant.lng),
    normalizeForCacheKey(customer.lat),
    normalizeForCacheKey(customer.lng)
  ];
  if (parts.some(part => !part)) return null;
  return parts.join('_');
}

export async function getCachedRouteFromRealtime(restaurant, customer) {
  if (!isFirebaseRealtimeAvailable()) return null;
  const key = buildRouteCacheKey(restaurant, customer);
  if (!key) return null;

  const db = getFirebaseRealtimeDb();
  const snap = await db.ref(`route_cache/${key}`).once('value');
  const value = snap.val();
  if (!value?.polyline) return null;

  const now = Date.now();
  if (value.expires_at && Number(value.expires_at) < now) {
    return null;
  }

  return {
    key,
    polyline: value.polyline,
    distanceKm: toNumber(value.distance),
    durationMin: toNumber(value.duration),
    cachedAt: toNumber(value.cached_at),
    expiresAt: toNumber(value.expires_at)
  };
}

export async function cacheRouteInRealtime(restaurant, customer, routeData, ttlDays = 7) {
  if (!isFirebaseRealtimeAvailable()) return null;
  const key = buildRouteCacheKey(restaurant, customer);
  if (!key) return null;

  const polyline = routeData?.polyline;
  if (!polyline || typeof polyline !== 'string') return null;

  const db = getFirebaseRealtimeDb();
  const now = Date.now();
  const expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;

  await db.ref(`route_cache/${key}`).update({
    polyline,
    distance: toNumber(routeData.distanceKm),
    duration: toNumber(routeData.durationMin),
    cached_at: now,
    expires_at: expiresAt
  });

  return key;
}

export async function findNearestOnlineDeliveryBoyFromRealtime(restaurantLat, restaurantLng, maxDistanceKm = 50, excludeIds = []) {
  if (!isFirebaseRealtimeAvailable()) return null;

  const db = getFirebaseRealtimeDb();
  const snapshot = await db
    .ref('delivery_boys')
    .orderByChild('status')
    .equalTo('online')
    .once('value');

  const data = snapshot.val();
  if (!data) return null;

  const excluded = new Set((excludeIds || []).map(id => String(id)));
  const lat = toNumber(restaurantLat);
  const lng = toNumber(restaurantLng);
  if (lat === null || lng === null) return null;

  let winner = null;
  for (const [deliveryPartnerId, item] of Object.entries(data)) {
    if (!item || excluded.has(String(deliveryPartnerId))) continue;
    const dLat = toNumber(item.lat);
    const dLng = toNumber(item.lng);
    if (dLat === null || dLng === null) continue;

    const distance = haversineKm(lat, lng, dLat, dLng);
    if (!Number.isFinite(distance) || distance > maxDistanceKm) continue;

    if (!winner || distance < winner.distance) {
      winner = {
        deliveryPartnerId: String(deliveryPartnerId),
        distance,
        location: {
          latitude: dLat,
          longitude: dLng
        }
      };
    }
  }

  return winner;
}

export async function syncUserRealtime({
  userId,
  lat,
  lng,
  address = '',
  area = '',
  city = '',
  state = '',
  formattedAddress = '',
  accuracy = null
}) {
  if (!isFirebaseRealtimeAvailable()) {
    if (shouldWarnRealtimeUnavailable()) {
      console.warn('⚠️ Firebase Realtime Database not available');
    }
    return false;
  }

  const id = toSafeKey(userId);
  const latitude = toNumber(lat);
  const longitude = toNumber(lng);
  if (!id || latitude === null || longitude === null) return false;

  const db = getFirebaseRealtimeDb();
  const payload = {
    lat: latitude,
    lng: longitude,
    address: address || '',
    area: area || '',
    city: city || '',
    state: state || '',
    formatted_address: formattedAddress || '',
    last_updated: Date.now()
  };

  const acc = toNumber(accuracy);
  if (acc !== null) payload.accuracy = acc;

  await db.ref(`users/${id}`).update(payload);
  return true;
}
