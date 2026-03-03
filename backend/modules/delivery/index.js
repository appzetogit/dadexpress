// Delivery module
import express from 'express';
import deliveryAuthRoutes from './routes/deliveryAuthRoutes.js';
import { updateFcmToken } from './controllers/deliveryAuthController.js';
import { authenticate } from './middleware/deliveryAuth.js';
import deliveryDashboardRoutes from './routes/deliveryDashboardRoutes.js';
import deliveryProfileRoutes from './routes/deliveryProfileRoutes.js';
import deliveryOrdersRoutes from './routes/deliveryOrdersRoutes.js';
import deliveryEarningsRoutes from './routes/deliveryEarningsRoutes.js';
import deliveryLocationRoutes from './routes/deliveryLocationRoutes.js';
import deliverySignupRoutes from './routes/deliverySignupRoutes.js';
import deliveryWalletRoutes from './routes/deliveryWalletRoutes.js';

const router = express.Router();

// Delivery authentication routes (public)
router.use('/auth', deliveryAuthRoutes);
router.post('/save-fcm-token', authenticate, updateFcmToken);
router.put('/save-fcm-token', authenticate, updateFcmToken);
router.patch('/save-fcm-token', authenticate, updateFcmToken);
router.post('/update-fcm-token', authenticate, updateFcmToken);
router.put('/update-fcm-token', authenticate, updateFcmToken);
router.patch('/update-fcm-token', authenticate, updateFcmToken);

// Delivery signup routes (protected - requires authentication)
router.use('/', deliverySignupRoutes);

// Delivery dashboard routes (protected)
router.use('/', deliveryDashboardRoutes);

// Delivery profile routes (protected)
router.use('/', deliveryProfileRoutes);

// Delivery orders routes (protected)
router.use('/', deliveryOrdersRoutes);

// Delivery earnings routes (protected)
router.use('/', deliveryEarningsRoutes);

// Delivery location routes (protected)
router.use('/', deliveryLocationRoutes);

// Delivery wallet routes (protected)
router.use('/wallet', deliveryWalletRoutes);

export default router;

