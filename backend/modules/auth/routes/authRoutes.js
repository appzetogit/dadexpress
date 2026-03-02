import express from 'express';
import {
  sendOTP,
  verifyOTP,
  register,
  login,
  resetPassword,
  refreshToken,
  logout,
  getCurrentUser,
  googleAuth,
  googleCallback,
  firebaseGoogleLogin,
  updateFcmToken
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const sendOTPSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)
    .optional(),
  email: Joi.string().email().optional(),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone', 'verify-email')
    .default('login')
}).or('phone', 'email');

const verifyOTPSchema = Joi.object({
  phone: Joi.string().optional(),
  email: Joi.string().email().optional(),
  otp: Joi.string().required().length(6),
  purpose: Joi.string()
    .valid('login', 'register', 'reset-password', 'verify-phone', 'verify-email')
    .default('login'),
  name: Joi.string().when('purpose', {
    is: 'register',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  role: Joi.string().valid('user', 'restaurant', 'delivery', 'admin').default('user'),
  password: Joi.string().min(6).max(100).optional(),
  fcmToken: Joi.string().optional().allow(null, ''),
  platform: Joi.string().valid('web', 'ios', 'android', 'app').optional().default('web')
}).or('phone', 'email');

const registerSchema = Joi.object({
  name: Joi.string().required().min(2).max(50),
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required().min(6).max(100),
  phone: Joi.string().optional().pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/),
  role: Joi.string().valid('user', 'restaurant', 'delivery', 'admin').default('user'),
  fcmToken: Joi.string().optional().allow(null, ''),
  platform: Joi.string().valid('web', 'ios', 'android', 'app').optional().default('web')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  password: Joi.string().required(),
  role: Joi.string().valid('user', 'restaurant', 'delivery', 'admin').optional(),
  fcmToken: Joi.string().optional().allow(null, ''),
  platform: Joi.string().valid('web', 'ios', 'android', 'app').optional().default('web')
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required().lowercase(),
  otp: Joi.string().required().length(6),
  newPassword: Joi.string().required().min(6).max(100),
  role: Joi.string().valid('user', 'restaurant', 'delivery', 'admin').optional()
});

// Public routes
router.post('/send-otp', validate(sendOTPSchema), sendOTP);
router.post('/verify-otp', validate(verifyOTPSchema), verifyOTP);
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

// Token management
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// Firebase Google login (using Firebase Auth ID token)
router.post('/firebase/google-login', firebaseGoogleLogin);

// Google OAuth routes
router.get('/google/:role', googleAuth);
router.get('/google/:role/callback', googleCallback);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.put('/update-fcm-token', authenticate, updateFcmToken);
router.post('/update-fcm-token', authenticate, updateFcmToken);
router.patch('/update-fcm-token', authenticate, updateFcmToken);
router.post('/save-fcm-token', authenticate, updateFcmToken);
router.put('/save-fcm-token', authenticate, updateFcmToken);

export default router;
