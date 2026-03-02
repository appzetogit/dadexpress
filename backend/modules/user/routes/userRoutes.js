import express from 'express';
import {
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
  updateUserLocation,
  getUserLocation,
  getUserAddresses,
  addUserAddress,
  updateUserAddress,
  deleteUserAddress
} from '../controllers/userController.js';
import { updateFcmToken } from '../../auth/controllers/authController.js';
import { authenticate } from '../../auth/middleware/auth.js';
import { uploadMiddleware } from '../../../shared/utils/cloudinaryService.js';
import userWalletRoutes from './userWalletRoutes.js';
import complaintRoutes from './complaintRoutes.js';
import referralRoutes from './referralRoutes.js';

const router = express.Router();

// All routes require user authentication
router.use(authenticate);

// Profile routes
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.post('/save-fcm-token', updateFcmToken);
router.post('/update-fcm-token', updateFcmToken);
router.put('/update-fcm-token', updateFcmToken);

// Profile image upload
router.post(
  '/profile/avatar',
  uploadMiddleware.single('image'),
  uploadProfileImage
);

// Location routes
router.get('/location', getUserLocation);
router.put('/location', updateUserLocation);

// Address routes
router.get('/addresses', getUserAddresses);
router.post('/addresses', addUserAddress);
router.put('/addresses/:id', updateUserAddress);
router.delete('/addresses/:id', deleteUserAddress);

// Wallet routes
router.use('/wallet', userWalletRoutes);

// Complaint routes
router.use('/complaints', complaintRoutes);

// Referral routes
router.use('/referral', referralRoutes);

export default router;

