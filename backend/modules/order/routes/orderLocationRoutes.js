import express from 'express';
import { updateOrderLocation } from '../controllers/orderController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Update delivery location
router.patch('/orders/:orderId/location', updateOrderLocation);

export default router;
