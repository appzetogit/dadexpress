import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import User from '../../auth/models/User.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';
import axios from 'axios';
import winston from 'winston';
import { syncUserRealtime } from '../../delivery/services/firebaseTrackingService.js';
import { getGoogleMapsApiKey } from '../../../shared/utils/envService.js';


const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const GEO_CACHE_TTL_MS = 10 * 60 * 1000;
const reverseGeocodeCache = new Map();

const getGeoCacheKey = (latitude, longitude) => {
  const lat = Number(latitude).toFixed(4);
  const lng = Number(longitude).toFixed(4);
  return `${lat},${lng}`;
};

const getCachedGeoAddress = (latitude, longitude) => {
  const key = getGeoCacheKey(latitude, longitude);
  const cached = reverseGeocodeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > GEO_CACHE_TTL_MS) {
    reverseGeocodeCache.delete(key);
    return null;
  }
  return cached.value;
};

const setCachedGeoAddress = (latitude, longitude, value) => {
  const key = getGeoCacheKey(latitude, longitude);
  reverseGeocodeCache.set(key, {
    value,
    timestamp: Date.now()
  });
};

const normalizeAddressParts = (parts = []) => {
  const cleaned = parts
    .map((part) => String(part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const exactValues = new Set(cleaned.map((part) => part.toLowerCase()));
  const withoutCityDupes = cleaned.filter((part) => {
    const lower = part.toLowerCase();
    if (!lower.endsWith(' city')) return true;
    const base = lower.replace(/\s+city$/, '').trim();
    return !exactValues.has(base);
  });

  const seen = new Set();
  return withoutCityDupes.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const resolveLocationFromNominatim = async (latitude, longitude) => {
  try {
    const cached = getCachedGeoAddress(latitude, longitude);
    if (cached) return cached;

    const response = await axios.get(
      'https://nominatim.openstreetmap.org/reverse',
      {
        params: {
          format: 'jsonv2',
          lat: latitude,
          lon: longitude,
          addressdetails: 1,
          zoom: 18
        },
        headers: {
          'Accept-Language': 'en',
          // Required by Nominatim usage policy; helps avoid anonymous throttling.
          'User-Agent': 'dadexpress-location-service/1.0'
        },
        timeout: 9000
      }
    );

    const data = response?.data || {};
    const addr = data?.address || {};

    const streetNumber = String(addr.house_number || '').trim();
    const road = String(addr.road || '').trim();
    const street = [streetNumber, road].filter(Boolean).join(' ').trim();
    const areaRaw =
      addr.suburb ||
      addr.neighbourhood ||
      addr.city_district ||
      addr.hamlet ||
      addr.quarter ||
      '';
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state_district ||
      '';
    const state = String(addr.state || '').trim();
    const postalCode = String(addr.postcode || '').trim();

    const areaBase = String(areaRaw || '').trim().toLowerCase().replace(/\s+city$/, '');
    const cityBase = String(city || '').trim().toLowerCase();
    const area = areaBase && cityBase && areaBase === cityBase ? '' : String(areaRaw || '').trim();

    const compactAddress = normalizeAddressParts([street, area, city, state, postalCode]).join(', ');
    const displayAddress = normalizeAddressParts(String(data.display_name || '').split(',')).join(', ');
    const formattedAddress = compactAddress || displayAddress || '';

    const resolved = {
      street,
      streetNumber,
      area,
      city: String(city || '').trim(),
      state,
      postalCode,
      formattedAddress,
      address: formattedAddress
    };
    setCachedGeoAddress(latitude, longitude, resolved);
    return resolved;
  } catch (error) {
    logger.warn(`Nominatim reverse geocode failed: ${error.message}`);
    return null;
  }
};

const resolveLocationFromBigDataCloud = async (latitude, longitude) => {
  try {
    const cached = getCachedGeoAddress(latitude, longitude);
    if (cached) return cached;

    const response = await axios.get(
      'https://api.bigdatacloud.net/data/reverse-geocode-client',
      {
        params: {
          latitude,
          longitude,
          localityLanguage: 'en'
        },
        timeout: 7000
      }
    );

    const data = response?.data || {};
    const localityInfo = Array.isArray(data?.localityInfo?.administrative)
      ? data.localityInfo.administrative
      : [];
    const areaFromHierarchy = localityInfo.find((level) => {
      const order = Number(level?.order);
      return Number.isFinite(order) && order >= 8 && order <= 10 && level?.name;
    })?.name || '';

    const city = String(data.city || data.locality || '').trim();
    const state = String(data.principalSubdivision || '').trim();
    const postalCode = String(data.postcode || '').trim();
    const areaRaw = String(data.locality || data.subLocality || areaFromHierarchy || '').trim();

    const areaBase = areaRaw.toLowerCase().replace(/\s+city$/, '');
    const cityBase = city.toLowerCase();
    const area = areaBase && cityBase && areaBase === cityBase ? '' : areaRaw;

    const formattedAddress = normalizeAddressParts(
      String(data.formattedAddress || '').split(',')
    ).join(', ') || normalizeAddressParts([area, city, state, postalCode]).join(', ');

    if (!formattedAddress) return null;

    const resolved = {
      street: '',
      streetNumber: '',
      area,
      city,
      state,
      postalCode,
      formattedAddress,
      address: formattedAddress
    };
    setCachedGeoAddress(latitude, longitude, resolved);
    return resolved;
  } catch (error) {
    logger.warn(`BigDataCloud reverse geocode failed: ${error.message}`);
    return null;
  }
};

const resolveLocationFromGoogleMaps = async (latitude, longitude) => {
  try {
    const cached = getCachedGeoAddress(latitude, longitude);
    if (cached) return cached;

    const apiKey = await getGoogleMapsApiKey();
    if (!apiKey) return null;

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: apiKey,
          language: 'en'
        },
        timeout: 7000
      }
    );

    const data = response?.data || {};
    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return null;
    }

    const result = data.results[0];
    const addressComponents = result.address_components || [];
    
    let city = "";
    let state = "";
    let area = "";
    let postalCode = "";
    let streetNumber = "";
    let route = "";

    addressComponents.forEach(comp => {
      const types = comp.types || [];
      if (types.includes('locality')) city = comp.long_name;
      if (types.includes('administrative_area_level_1')) state = comp.long_name;
      if (types.includes('postal_code')) postalCode = comp.long_name;
      if (types.includes('sublocality_level_1') || types.includes('sublocality') || types.includes('neighborhood')) {
        area = comp.long_name;
      }
      if (types.includes('street_number')) streetNumber = comp.long_name;
      if (types.includes('route')) route = comp.long_name;
    });

    const street = [streetNumber, route].filter(Boolean).join(' ').trim();
    const formattedAddress = result.formatted_address || '';

    const resolved = {
      street,
      streetNumber,
      area,
      city,
      state,
      postalCode,
      formattedAddress,
      address: formattedAddress
    };

    setCachedGeoAddress(latitude, longitude, resolved);
    return resolved;
  } catch (error) {
    logger.warn(`Google Maps reverse geocode failed: ${error.message}`);
    return null;
  }
};

const resolveLocationFromFreeGeocode = async (latitude, longitude) => {
  // Try Google Maps first (if API key is available)
  const googleRes = await resolveLocationFromGoogleMaps(latitude, longitude);
  if (googleRes) return googleRes;

  const nominatim = await resolveLocationFromNominatim(latitude, longitude);
  if (nominatim) return nominatim;

  return resolveLocationFromBigDataCloud(latitude, longitude);
};


const sanitizeAreaCandidate = (value) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Area should be a locality-like label, not a full multi-part address blob.
  if (text.includes(',') || text.length > 80) return '';
  return text;
};

const sanitizeAddressCandidate = (value) => {
  const text = normalizeAddressParts(String(value || '').split(',')).join(', ');
  if (!text) return '';
  if (/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(text)) return '';
  return text;
};

/**
 * Get user profile
 * GET /api/user/profile
 */
export const getUserProfile = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .lean();

    if (!user) {
      return errorResponse(res, 404, 'User profile not found');
    }

    return successResponse(res, 200, 'User profile retrieved successfully', {
      user
    });
  } catch (error) {
    logger.error(`Error fetching user profile: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch user profile');
  }
});

/**
 * Update user profile
 * PUT /api/user/profile
 */
export const updateUserProfile = asyncHandler(async (req, res) => {
  try {
    const { name, email, phone, dateOfBirth, anniversary, gender } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User profile not found');
    }

    // Update fields
    if (name !== undefined && name !== null) {
      user.name = name.trim();
    }
    
    if (email !== undefined && email !== null && email.trim() !== '') {
      // Check if email already exists for another user
      const existingUser = await User.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
        role: 'user'
      });
      
      if (existingUser) {
        return errorResponse(res, 400, 'Email already in use');
      }
      
      user.email = email.toLowerCase().trim();
    }
    
    if (phone !== undefined && phone !== null) {
      // Check if phone already exists for another user
      if (phone.trim() !== '') {
        const existingUser = await User.findOne({ 
          phone: phone.trim(),
          _id: { $ne: user._id },
          role: 'user'
        });
        
        if (existingUser) {
          return errorResponse(res, 400, 'Phone number already in use');
        }
      }
      
      user.phone = phone ? phone.trim() : null;
    }

    // Update additional profile fields (if they exist in schema)
    if (dateOfBirth !== undefined) {
      user.dateOfBirth = dateOfBirth || null;
    }

    if (anniversary !== undefined) {
      user.anniversary = anniversary || null;
    }

    if (gender !== undefined) {
      user.gender = gender || null;
    }

    // Save to database
    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    logger.info(`User profile updated: ${user._id}`, {
      updatedFields: { name, email, phone, dateOfBirth, anniversary, gender }
    });

    return successResponse(res, 200, 'Profile updated successfully', {
      user: userResponse
    });
  } catch (error) {
    logger.error(`Error updating user profile: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update profile');
  }
});

/**
 * Upload profile image
 * POST /api/user/profile/avatar
 */
export const uploadProfileImage = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Upload to Cloudinary
    const folder = 'appzeto/user-profiles';
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ]
    });

    // Update user profile image
    user.profileImage = result.secure_url;
    await user.save();

    logger.info(`Profile image uploaded for user: ${user._id}`, {
      imageUrl: result.secure_url
    });

    return successResponse(res, 200, 'Profile image uploaded successfully', {
      profileImage: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    logger.error(`Error uploading profile image: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to upload profile image');
  }
});

/**
 * Update user current location (Live Location Tracking)
 * PUT /api/user/location
 * 
 * This endpoint handles both regular location updates and live location tracking.
 * It stores complete address information including POI, building, floor, area, city, state, pincode.
 */
export const updateUserLocation = asyncHandler(async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      address, 
      city, 
      state, 
      area, 
      formattedAddress,
      accuracy,
      postalCode,
      street,
      streetNumber
    } = req.body;

    // Validate required fields
    if (!latitude || !longitude) {
      return errorResponse(res, 400, 'Latitude and longitude are required');
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    // Validate coordinates
    if (isNaN(latNum) || isNaN(lngNum)) {
      return errorResponse(res, 400, 'Invalid latitude or longitude');
    }

    // Validate coordinate ranges
    if (latNum < -90 || latNum > 90) {
      return errorResponse(res, 400, 'Latitude must be between -90 and 90');
    }
    if (lngNum < -180 || lngNum > 180) {
      return errorResponse(res, 400, 'Longitude must be between -180 and 180');
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const liveResolved = await resolveLocationFromFreeGeocode(latNum, lngNum);

    const resolvedAddress = liveResolved?.address || '';
    const resolvedCity = liveResolved?.city || '';
    const resolvedState = liveResolved?.state || '';
    const resolvedArea = liveResolved?.area || '';
    const resolvedFormattedAddress = liveResolved?.formattedAddress || '';
    const resolvedPostalCode = liveResolved?.postalCode || '';
    const resolvedStreet = liveResolved?.street || '';
    const resolvedStreetNumber = liveResolved?.streetNumber || '';

    const safeAreaFallback = sanitizeAreaCandidate(area);
    const safeAddressFallback = sanitizeAddressCandidate(address);
    const safeFormattedFallback = sanitizeAddressCandidate(formattedAddress);

    // Build complete location object.
    // PRIORITIZE frontend data if it looks specific (not a placeholder).
    // Placeholder addresses usually contain coordinates or generic "Current Location" / "Select location"
    const isPlaceholder = (text) => {
      if (!text) return true;
      const t = text.trim();
      return /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(t) || 
             t.toLowerCase() === 'current location' || 
             t.toLowerCase() === 'select location';
    };

    const locationUpdate = {
      latitude: latNum,
      longitude: lngNum,
      // If frontend sent a real address, use it. Otherwise use geocoded.
      address: (!isPlaceholder(address) ? address : resolvedAddress) || '',
      city: city || resolvedCity || '',
      state: state || resolvedState || '',
      area: (!isPlaceholder(area) ? area : resolvedArea) || '',
      formattedAddress: (!isPlaceholder(formattedAddress) ? formattedAddress : (resolvedFormattedAddress || resolvedAddress || address)) || '',
      lastUpdated: new Date(),
      location: {
        type: 'Point',
        coordinates: [lngNum, latNum] // [longitude, latitude] for GeoJSON
      }
    };

    // Add optional fields if provided
    if (accuracy !== undefined && accuracy !== null) {
      locationUpdate.accuracy = parseFloat(accuracy);
    }
    if (resolvedPostalCode || postalCode) {
      locationUpdate.postalCode = resolvedPostalCode || postalCode;
    }
    if (resolvedStreet || street) {
      locationUpdate.street = resolvedStreet || street;
    }
    if (resolvedStreetNumber || streetNumber) {
      locationUpdate.streetNumber = resolvedStreetNumber || streetNumber;
    }

    // Update current location
    user.currentLocation = locationUpdate;

    // Save to database
    await user.save();

    // Mirror user live location to Firebase Realtime Database (non-blocking)
    syncUserRealtime({
      userId: user._id?.toString(),
      lat: latNum,
      lng: lngNum,
      address: locationUpdate.address,
      area: locationUpdate.area,
      city: locationUpdate.city,
      state: locationUpdate.state,
      formattedAddress: locationUpdate.formattedAddress,
      accuracy: locationUpdate.accuracy
    }).catch((syncError) => {
      logger.warn(`Firebase users sync failed: ${syncError.message}`);
    });

    logger.info(`User live location updated: ${user._id}`, {
      latitude: latNum,
      longitude: lngNum,
      city: user.currentLocation.city,
      area: user.currentLocation.area,
      formattedAddress: user.currentLocation.formattedAddress,
      accuracy: user.currentLocation.accuracy,
      timestamp: user.currentLocation.lastUpdated
    });

    const userResponse = user.toObject();
    delete userResponse.password;

    return successResponse(res, 200, 'Location updated successfully', {
      location: user.currentLocation,
      message: 'Live location stored in database'
    });
  } catch (error) {
    logger.error(`Error updating user location: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update location');
  }
});

/**
 * Get user current location
 * GET /api/user/location
 */
export const getUserLocation = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('currentLocation')
      .lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    return successResponse(res, 200, 'Location retrieved successfully', {
      location: user.currentLocation || null
    });
  } catch (error) {
    logger.error(`Error fetching user location: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch location');
  }
});

/**
 * Get user addresses
 * GET /api/user/addresses
 */
export const getUserAddresses = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('addresses')
      .lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Add _id to each address for frontend compatibility
    const addresses = (user.addresses || []).map(addr => ({
      ...addr,
      id: addr._id ? addr._id.toString() : null
    }));

    return successResponse(res, 200, 'Addresses retrieved successfully', {
      addresses
    });
  } catch (error) {
    logger.error(`Error fetching user addresses: ${error.message}`);
    return errorResponse(res, 500, 'Failed to fetch addresses');
  }
});

/**
 * Add user address
 * POST /api/user/addresses
 */
export const addUserAddress = asyncHandler(async (req, res) => {
  try {
    const { label, street, additionalDetails, city, state, zipCode, latitude, longitude, isDefault } = req.body;

    if (!street || !city || !state) {
      return errorResponse(res, 400, 'Street, city, and state are required');
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Prepare address object
    const newAddress = {
      label: label || 'Other',
      street,
      additionalDetails: additionalDetails || '',
      city,
      state,
      zipCode: zipCode || '',
      isDefault: isDefault === true || (user.addresses || []).length === 0
    };

    // Add location coordinates if provided
    if (latitude && longitude) {
      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        newAddress.location = {
          type: 'Point',
          coordinates: [lngNum, latNum] // [longitude, latitude]
        };
      }
    }

    // If this is set as default, unset other defaults
    if (newAddress.isDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }

    // Add address
    user.addresses.push(newAddress);
    await user.save();

    // Get the added address with _id
    const addedAddress = user.addresses[user.addresses.length - 1];
    const addressResponse = {
      ...addedAddress.toObject(),
      id: addedAddress._id.toString()
    };

    // Sync lat/long to Firebase Realtime Database (non-blocking)
    if (latitude && longitude) {
      const { syncUserRealtime } = await import('../../delivery/services/firebaseTrackingService.js');
      syncUserRealtime({
        userId: user._id.toString(),
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        address: street || '',
        area: additionalDetails || '',
        city: city || '',
        state: state || '',
        formattedAddress: `${street || ''}, ${city || ''}, ${state || ''}`.trim()
      }).catch((syncError) => {
        logger.warn(`Firebase user location sync failed: ${syncError.message}`);
      });
    }

    logger.info(`Address added for user: ${user._id}`, {
      addressId: addressResponse.id
    });

    return successResponse(res, 201, 'Address added successfully', {
      address: addressResponse
    });
  } catch (error) {
    logger.error(`Error adding address: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to add address');
  }
});

/**
 * Update user address
 * PUT /api/user/addresses/:id
 */
export const updateUserAddress = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { label, street, additionalDetails, city, state, zipCode, latitude, longitude, isDefault } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const address = user.addresses.id(id);
    if (!address) {
      return errorResponse(res, 404, 'Address not found');
    }

    // Update address fields
    if (label !== undefined) address.label = label;
    if (street !== undefined) address.street = street;
    if (additionalDetails !== undefined) address.additionalDetails = additionalDetails;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (zipCode !== undefined) address.zipCode = zipCode;

    // Update location coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      const latNum = parseFloat(latitude);
      const lngNum = parseFloat(longitude);
      if (!isNaN(latNum) && !isNaN(lngNum)) {
        address.location = {
          type: 'Point',
          coordinates: [lngNum, latNum] // [longitude, latitude]
        };
      }
    }

    // Handle default address
    if (isDefault === true) {
      user.addresses.forEach(addr => {
        addr.isDefault = addr._id.toString() === id;
      });
    } else if (isDefault === false && address.isDefault) {
      // If unsetting default and this was the default, set first other address as default
      const otherAddress = user.addresses.find(addr => addr._id.toString() !== id);
      if (otherAddress) {
        otherAddress.isDefault = true;
      }
      address.isDefault = false;
    }

    await user.save();

    const addressResponse = {
      ...address.toObject(),
      id: address._id.toString()
    };

    logger.info(`Address updated for user: ${user._id}`, {
      addressId: id
    });

    return successResponse(res, 200, 'Address updated successfully', {
      address: addressResponse
    });
  } catch (error) {
    logger.error(`Error updating address: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to update address');
  }
});

/**
 * Delete user address
 * DELETE /api/user/addresses/:id
 */
export const deleteUserAddress = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const address = user.addresses.id(id);
    if (!address) {
      return errorResponse(res, 404, 'Address not found');
    }

    const wasDefault = address.isDefault;

    // Remove address
    user.addresses.pull(id);

    // If deleted address was default, set first remaining address as default
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    logger.info(`Address deleted for user: ${user._id}`, {
      addressId: id
    });

    return successResponse(res, 200, 'Address deleted successfully');
  } catch (error) {
    logger.error(`Error deleting address: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to delete address');
  }
});/**
 * Delete user account
 * DELETE /api/user/profile
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Soft delete - mark as deleted instead of removing from database
    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    logger.info(`User account deleted: ${req.user._id}`);

    return successResponse(res, 200, 'Account deleted successfully');
  } catch (error) {
    logger.error(`Error deleting user account: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to delete account');
  }
});
