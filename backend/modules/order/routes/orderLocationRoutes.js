import express from 'express';
import { updateOrderLocation } from '../controllers/orderController.js';
import { authenticate } from '../../auth/middleware/auth.js';

const router = express.Router();

// Update delivery location
router.patch('/orders/:orderId/location', authenticate, updateOrderLocation);

export default router;
