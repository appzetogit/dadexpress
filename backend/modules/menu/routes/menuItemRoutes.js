import express from 'express';
import { getItems, getItemById, getItemsByCategory } from '../controllers/menuItemController.js';

const router = express.Router();

/**
 * Public Menu Routes
 */

// Search/Filter items
router.get('/items', getItems);

// Get single item details (Used by FoodDetailPage)
router.get('/items/:id', getItemById);

// Get items by category (Used by CategoryFoodsPage)
router.get('/categories/:categoryName/items', getItemsByCategory);

export default router;
