import express from 'express';
import menuItemRoutes from './routes/menuItemRoutes.js';

const router = express.Router();

/**
 * Menu module routes
 * Used for public access to items across all restaurants
 */

router.use('/', menuItemRoutes);

export default router;
