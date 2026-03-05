import Menu from '../../restaurant/models/Menu.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';
import mongoose from 'mongoose';

/**
 * Get all menu items with filtering
 * GET /api/menu/items
 */
export const getItems = asyncHandler(async (req, res) => {
    const { category, search, limit = 50, offset = 0 } = req.query;

    // Since items are nested in Sections/Subsections, we have to find Menus that contain them
    // This is not very efficient for large datasets, but given the current schema, this is the way.

    const query = { isActive: true };

    // Find all active restaurants first to ensure we only get items from active ones
    const activeRestaurants = await Restaurant.find({ isActive: true }).select('_id').lean();
    const activeRestaurantIds = activeRestaurants.map(r => r._id);

    query.restaurant = { $in: activeRestaurantIds };

    const menus = await Menu.find(query).populate('restaurant', 'name slug profileImage rating estimatedDeliveryTime location').lean();

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
 * Get items by category slug/name
 * GET /api/menu/categories/:categoryName/items
 */
export const getItemsByCategory = asyncHandler(async (req, res) => {
    const { categoryName } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Same logic as getItems but specifically for a category
    // In our schema, category is a string field on the item

    const activeRestaurants = await Restaurant.find({ isActive: true }).select('_id').lean();
    const activeRestaurantIds = activeRestaurants.map(r => r._id);

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
