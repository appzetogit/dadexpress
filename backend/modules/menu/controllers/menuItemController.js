import Menu from '../../restaurant/models/Menu.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import Zone from '../../admin/models/Zone.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

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

/**
 * Helper to calculate distance between two coordinates in km (Haversine)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Resolve active restaurant IDs filtered by user zone / coordinates
 */
async function getActiveRestaurantIdsForZone(zoneId, lat, lng) {
    let targetZone = null;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    if (zoneId) {
        if (mongoose.Types.ObjectId.isValid(zoneId)) {
            targetZone = await Zone.findById(zoneId).lean();
        }
        if (!targetZone) {
            targetZone = await Zone.findOne({
                $or: [{ _id: zoneId }, { name: zoneId }]
            }).lean();
        }
    }

    if (!targetZone && !isNaN(userLat) && !isNaN(userLng)) {
        const allZones = await Zone.find({ isActive: true }).lean();
        for (const z of allZones) {
            if (isPointInZone(userLat, userLng, z.coordinates)) {
                targetZone = z;
                break;
            }
        }
    }

    const baseRestaurantFilter = {
        isActive: true,
        approvedAt: { $ne: null }
    };

    // If a specific zone was requested / identified:
    if (targetZone && Array.isArray(targetZone.coordinates) && targetZone.coordinates.length >= 3) {
        const allRestaurants = await Restaurant.find(baseRestaurantFilter)
            .select('_id location name')
            .lean();

        const BUFFER_DISTANCE = 1.5; // 1.5km buffer around zone boundaries, matching restaurantController
        const matchedIds = allRestaurants
            .filter(r => {
                const rLat = r.location?.latitude ?? (Array.isArray(r.location?.coordinates) ? r.location.coordinates[1] : null);
                const rLng = r.location?.longitude ?? (Array.isArray(r.location?.coordinates) ? r.location.coordinates[0] : null);
                if (rLat == null || rLng == null || isNaN(rLat) || isNaN(rLng)) return false;

                // 1. Strict polygon check
                if (isPointInZone(rLat, rLng, targetZone.coordinates)) return true;

                // 2. Buffer margin check for boundary cases
                for (const vertex of targetZone.coordinates) {
                    const vLat = vertex.latitude || vertex.lat;
                    const vLng = vertex.longitude || vertex.lng;
                    if (vLat && vLng && calculateDistance(rLat, rLng, vLat, vLng) <= BUFFER_DISTANCE) {
                        return true;
                    }
                }
                return false;
            })
            .map(r => r._id);

        console.log(`🔍 [MENU-ITEMS-ZONE] Zone "${targetZone.name}" (${targetZone._id}): matched ${matchedIds.length} restaurants out of ${allRestaurants.length}`);
        return matchedIds;
    }

    // Fallback if no zone specified at all
    const fallbackRestaurants = await Restaurant.find(baseRestaurantFilter).select('_id').lean();
    return fallbackRestaurants.map(r => r._id);
}

/**
 * Get all menu items with filtering (strictly filtered by user's zone if provided)
 * GET /api/menu/items
 */
export const getItems = asyncHandler(async (req, res) => {
    const { category, search, limit = 50, offset = 0, zoneId, latitude, longitude, lat, lng } = req.query;

    const activeRestaurantIds = await getActiveRestaurantIdsForZone(
        zoneId,
        latitude || lat,
        longitude || lng
    );

    // If zone was specified but has no restaurants, return empty results immediately
    if (!activeRestaurantIds || activeRestaurantIds.length === 0) {
        return successResponse(res, 200, 'Items retrieved successfully', {
            items: [],
            total: 0,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    }

    const query = {
        isActive: true,
        restaurant: { $in: activeRestaurantIds }
    };

    const menus = await Menu.find(query).populate('restaurant', 'name slug profileImage rating estimatedDeliveryTime location cuisines').lean();

    let allItems = [];

    menus.forEach(menu => {
        menu.sections.forEach(section => {
            if (section.isEnabled === false) return;

            const processItem = (item, sectionName, subsectionName = null) => {
                // Filter by category if provided
                if (category && item.category !== category && sectionName !== category) return;

                // Filter by search query if provided
                if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
                    !item.description.toLowerCase().includes(search.toLowerCase())) return;

                // Only show approved items
                if (item.approvalStatus !== 'approved' && item.approvalStatus !== undefined) return;
                if (item.isAvailable === false) return;

                allItems.push({
                    ...item,
                    restaurant: menu.restaurant,
                    sectionName,
                    subsectionName
                });
            };

            (section.items || []).forEach(item => processItem(item, section.name));

            (section.subsections || []).forEach(subsection => {
                (subsection.items || []).forEach(item => processItem(item, section.name, subsection.name));
            });
        });
    });

    // Apply pagination
    const paginatedItems = allItems.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return successResponse(res, 200, 'Items retrieved successfully', {
        items: paginatedItems,
        total: allItems.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
    });
});

/**
 * Get a single menu item by ID
 * GET /api/menu/items/:id
 */
export const getItemById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Search through all menus for the item
    const menu = await Menu.findOne({
        $or: [
            { "sections.items.id": id },
            { "sections.subsections.items.id": id }
        ]
    }).populate('restaurant', 'name slug profileImage rating totalRatings estimatedDeliveryTime location cuisines').lean();

    if (!menu) {
        return errorResponse(res, 404, 'Item not found');
    }

    let foundItem = null;

    menu.sections.forEach(section => {
        (section.items || []).forEach(item => {
            if (item.id === id) foundItem = { ...item, restaurant: menu.restaurant };
        });

        if (!foundItem) {
            (section.subsections || []).forEach(subsection => {
                (subsection.items || []).forEach(item => {
                    if (item.id === id) foundItem = { ...item, restaurant: menu.restaurant };
                });
            });
        }
    });

    if (!foundItem) {
        return errorResponse(res, 404, 'Item not found in menu structure');
    }

    return successResponse(res, 200, 'Item retrieved successfully', {
        item: foundItem
    });
});

/**
 * Get items by category slug/name (strictly filtered by user's zone if provided)
 * GET /api/menu/categories/:categoryName/items
 */
export const getItemsByCategory = asyncHandler(async (req, res) => {
    const { categoryName } = req.params;
    const { limit = 50, offset = 0, zoneId, latitude, longitude, lat, lng } = req.query;

    const activeRestaurantIds = await getActiveRestaurantIdsForZone(
        zoneId,
        latitude || lat,
        longitude || lng
    );

    if (!activeRestaurantIds || activeRestaurantIds.length === 0) {
        return successResponse(res, 200, 'Category items retrieved successfully', {
            items: [],
            total: 0,
            categoryName
        });
    }

    const menus = await Menu.find({
        restaurant: { $in: activeRestaurantIds },
        isActive: true
    }).populate('restaurant', 'name slug profileImage rating estimatedDeliveryTime location cuisines').lean();

    let allItems = [];

    menus.forEach(menu => {
        menu.sections.forEach(section => {
            if (section.isEnabled === false) return;

            const processItem = (item) => {
                // Compare with categoryName (could be slug or name)
                const itemCategory = item.category || section.name;
                const matchesCategory =
                    itemCategory.toLowerCase() === categoryName.toLowerCase() ||
                    itemCategory.toLowerCase().replace(/\s+/g, '-') === categoryName.toLowerCase();

                if (!matchesCategory) return;
                if (item.approvalStatus !== 'approved' && item.approvalStatus !== undefined) return;
                if (item.isAvailable === false) return;

                allItems.push({
                    ...item,
                    restaurant: menu.restaurant
                });
            };

            (section.items || []).forEach(item => processItem(item));
            (section.subsections || []).forEach(subsection => {
                (subsection.items || []).forEach(item => processItem(item));
            });
        });
    });

    const paginatedItems = allItems.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return successResponse(res, 200, 'Category items retrieved successfully', {
        items: paginatedItems,
        total: allItems.length,
        categoryName
    });
});
