import Delivery from '../models/Delivery.js';
import otpService from '../../auth/services/otpService.js';
import jwtService from '../../auth/services/jwtService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { normalizePhoneNumber } from '../../../shared/utils/phoneUtils.js';
import { getRefreshCookieOptions } from '../../../shared/utils/cookieOptions.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Build phone query that searches in multiple formats (with/without country code)
 */
const buildPhoneQuery = (normalizedPhone) => {
  if (!normalizedPhone) return null;

  let variants = [];
  if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
    const phoneWithoutCountryCode = normalizedPhone.substring(2);
    variants = [
      normalizedPhone,
      phoneWithoutCountryCode,
      `+${normalizedPhone}`,
      `+91${phoneWithoutCountryCode}`
    ];
  } else {
    variants = [
      normalizedPhone,
      `91${normalizedPhone}`,
      `+91${normalizedPhone}`,
      `+${normalizedPhone}`
    ];
  }

  return { phone: { $in: variants } };
};

/**
 * Send OTP for delivery boy phone number
 * POST /api/delivery/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, purpose = 'login' } = req.body;

  // Validate phone number
  if (!phone) {
    return errorResponse(res, 400, 'Phone number is required');
  }

  // Validate phone number format
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  if (!phoneRegex.test(phone)) {
    return errorResponse(res, 400, 'Invalid phone number format');
  }

  try {
    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Default OTP for specific number (Requested by USER)
    if (normalizedPhone === '919009925021') {
      return successResponse(res, 200, 'OTP sent successfully to phone', {
        expiresIn: 300,
        identifierType: 'phone'
      });
    }

    const result = await otpService.generateAndSendOTP(normalizedPhone, purpose, null);
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, error.message);
  }
});

/**
 * Verify OTP and login/register delivery boy
 * POST /api/delivery/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  let { phone, otp, purpose = 'login', name } = req.body;

  // Validate inputs
  if (!phone || !otp) {
    return errorResponse(res, 400, 'Phone number and OTP are required');
  }

  // Normalize phone number
  phone = normalizePhoneNumber(phone);

  // Default OTP for specific number (Requested by USER)
  const isDefaultOTP = (phone === '919009925021' && otp === '123456');

  // Normalize name - convert null/undefined to empty string for optional field
  const normalizedName = name && typeof name === 'string' ? name.trim() : null;

  try {
    let delivery;
    const identifier = phone;

    if (purpose === 'register') {
      // Registration flow
      // Check if delivery boy already exists
      delivery = await Delivery.findOne(buildPhoneQuery(phone));

      if (delivery) {
        return errorResponse(res, 400, 'Delivery boy already exists with this phone number. Please login.');
      }

      // Name is mandatory for explicit registration
      if (!normalizedName) {
        return errorResponse(res, 400, 'Name is required for registration');
      }

      // Verify OTP before creating delivery boy
      if (isDefaultOTP) {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(phone, otp, purpose, null);
      }

      const deliveryData = {
        name: normalizedName,
        phone,
        phoneVerified: true,
        signupMethod: 'phone',
        status: 'pending', // New delivery boys start as pending approval
        isActive: true, // Allow login to see verification message
        fcmToken: req.body.fcmToken || null,
        platform: req.body.platform || 'web'
      };

      try {
        delivery = await Delivery.create(deliveryData);
        if (delivery.fcmToken) {
          console.log(`[PUSH-NOTIFICATION] FCM Token stored for new delivery registration ${delivery._id}: ${delivery.fcmToken} (${delivery.platform})`);
        }

        logger.info(`New delivery boy registered: ${delivery._id}`, {
          phone,
          deliveryId: delivery._id,
          deliveryIdField: delivery.deliveryId
        });
      } catch (createError) {
        // Handle duplicate key error
        if (createError.code === 11000) {
          delivery = await Delivery.findOne({ phone });
          if (!delivery) {
            throw createError;
          }
          return errorResponse(res, 400, 'Delivery boy already exists with this phone number. Please login.');
        } else {
          throw createError;
        }
      }
    } else {
      // Find delivery boy by phone
      // Search in both formats (with and without country code) to handle varied data
      delivery = await Delivery.findOne(buildPhoneQuery(phone));

      if (delivery && delivery.isDeleted) {
        return errorResponse(res, 403, 'Your account has been deleted. Please contact support.');
      }

      if (!delivery && !name) {
        // New user - create minimal record for signup flow
        // But we need name first if not provided
        return successResponse(res, 200, 'New delivery partner. Please provide name.', {
          needsName: true,
          identifierType: 'phone',
          identifier: phone
        });
      }

      // Verify OTP first (before creating user)
      if (isDefaultOTP) {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(phone, otp, purpose, null);
      }

      if (!delivery) {
        // New user - create minimal record for signup flow
        // Use provided name or placeholder
        const { fcmToken, platform = 'web' } = req.body;
        const deliveryData = {
          name: normalizedName || 'Delivery Partner', // Placeholder if not provided
          phone,
          phoneVerified: true,
          signupMethod: 'phone',
          status: 'pending', // New delivery boys start as pending approval
          isActive: true, // Allow login to see verification message
          platform: platform || 'web'
        };

        if (fcmToken) {
          if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
            deliveryData.fcmTokenMobile = fcmToken;
          } else {
            deliveryData.fcmToken = fcmToken;
          }
        }

        try {
          delivery = await Delivery.create(deliveryData);
          logger.info(`New delivery boy created for signup: ${delivery._id}`, {
            phone,
            deliveryId: delivery._id,
            deliveryIdField: delivery.deliveryId,
            hasName: !!normalizedName
          });
        } catch (createError) {
          if (createError.code === 11000) {
            delivery = await Delivery.findOne({ phone });
            if (!delivery) {
              throw createError;
            }
            logger.info(`Delivery boy found after duplicate key error: ${delivery._id}`);
          } else {
            throw createError;
          }
        }
      } else {
        // Existing delivery boy login - update verification status if needed
        if (!delivery.phoneVerified) {
          delivery.phoneVerified = true;
        }

        // Update FCM Token and platform on login
        if (req.body.fcmToken) {
          const { fcmToken, platform } = req.body;
          delivery.platform = platform || delivery.platform || 'web';

          if (['android', 'ios', 'app'].includes(delivery.platform?.toLowerCase())) {
            delivery.fcmTokenMobile = fcmToken;
          } else {
            delivery.fcmToken = fcmToken;
          }

          console.log(`[PUSH-NOTIFICATION] FCM Token stored for delivery login ${delivery._id}: ${fcmToken} (${delivery.platform})`);
        }
        await delivery.save();
      }

      // Check if signup needs to be completed (missing required fields)
      // Only force signup if the delivery boy is pending (not if already active/approved/suspended)
      const needsSignup = delivery.status === 'pending' && (
        !delivery.location?.city ||
        !delivery.vehicle?.number ||
        !delivery.documents?.pan?.number ||
        !delivery.documents?.aadhar?.number ||
        !delivery.documents?.aadhar?.document ||
        !delivery.documents?.pan?.document ||
        !delivery.documents?.drivingLicense?.document
      );

      if (needsSignup) {
        // Generate tokens for signup flow
        const tokens = jwtService.generateTokens({
          userId: delivery._id.toString(),
          role: 'delivery',
          email: delivery.email || delivery.phone || delivery.deliveryId
        });

        // Store refresh token
        delivery.refreshToken = tokens.refreshToken;
        await delivery.save();

        // Set refresh token in httpOnly cookie
        res.cookie(
          'delivery_refreshToken',
          tokens.refreshToken,
          getRefreshCookieOptions({
            maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
          })
        );

        return successResponse(res, 200, 'OTP verified. Please complete your profile.', {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: {
            id: delivery._id,
            name: delivery.name,
            phone: delivery.phone,
            email: delivery.email,
            deliveryId: delivery.deliveryId,
            status: delivery.status,
            rejectionReason: delivery.rejectionReason || null // Include rejection reason for blocked accounts
          },
          needsSignup: true // Signal that signup needs to be completed
        });
      }
    }

    // Check if delivery boy is active (blocked/pending status partners can still login to see rejection reason or verification message)
    if (!delivery.isActive && delivery.status !== 'blocked' && delivery.status !== 'pending') {
      return errorResponse(res, 403, 'Your account has been deactivated. Please contact support.');
    }

    // Generate tokens
    const tokens = jwtService.generateTokens({
      userId: delivery._id.toString(),
      role: 'delivery',
      email: delivery.email || delivery.phone || delivery.deliveryId
    });

    // Store refresh token in database
    delivery.refreshToken = tokens.refreshToken;
    await delivery.save();

    // Set refresh token in httpOnly cookie
    res.cookie(
      'delivery_refreshToken',
      tokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
      })
    );

    // Update last login
    delivery.lastLogin = new Date();
    await delivery.save();

    // Return access token and delivery boy info
    return successResponse(res, 200, 'Authentication successful', {
      accessToken: tokens.accessToken,
      user: {
        id: delivery._id,
        deliveryId: delivery.deliveryId,
        name: delivery.name,
        email: delivery.email,
        phone: delivery.phone,
        phoneVerified: delivery.phoneVerified,
        signupMethod: delivery.signupMethod,
        profileImage: delivery.profileImage,
        isActive: delivery.isActive,
        status: delivery.status,
        rejectionReason: delivery.rejectionReason || null, // Include rejection reason for blocked accounts
        metrics: delivery.metrics,
        earnings: delivery.earnings
      }
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Refresh Access Token
 * POST /api/delivery/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from delivery module cookie
  const refreshToken = req.cookies?.delivery_refreshToken;

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    // Ensure it's a delivery token
    if (decoded.role !== 'delivery') {
      return errorResponse(res, 401, 'Invalid token for delivery');
    }

    // Get delivery boy from database and verify refresh token matches
    const delivery = await Delivery.findById(decoded.userId).select('+refreshToken');

    if (!delivery || !delivery.isActive) {
      return errorResponse(res, 401, 'Delivery boy not found or inactive');
    }

    // Note: We've removed the strict DB comparison for multi-device support
    /*
    if (delivery.refreshToken !== refreshToken) {
      return errorResponse(res, 401, 'Invalid refresh token');
    }
    */

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: delivery._id.toString(),
      role: 'delivery',
      email: delivery.email || delivery.phone || delivery.deliveryId
    });

    return successResponse(res, 200, 'Token refreshed successfully', {
      accessToken
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid refresh token');
  }
});

/**
 * Logout
 * POST /api/delivery/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Get delivery boy from request (set by auth middleware)
  if (req.delivery) {
    // Clear refresh token from database
    req.delivery.refreshToken = null;
    await req.delivery.save();
  }

  // Clear refresh token cookie
  res.cookie('delivery_refreshToken', '', getRefreshCookieOptions({ maxAge: 0 }));
  res.clearCookie('refreshToken', getRefreshCookieOptions());
  return successResponse(res, 200, 'Logged out successfully');
});

/**
 * Get current delivery boy
 * GET /api/delivery/auth/me
 */
export const getCurrentDelivery = asyncHandler(async (req, res) => {
  // Delivery boy is attached by authenticate middleware
  return successResponse(res, 200, 'Delivery boy retrieved successfully', {
    user: {
      id: req.delivery._id,
      deliveryId: req.delivery.deliveryId,
      name: req.delivery.name,
      email: req.delivery.email,
      phone: req.delivery.phone,
      phoneVerified: req.delivery.phoneVerified,
      signupMethod: req.delivery.signupMethod,
      profileImage: req.delivery.profileImage,
      isActive: req.delivery.isActive,
      status: req.delivery.status,
      location: req.delivery.location,
      vehicle: req.delivery.vehicle,
      documents: req.delivery.documents,
      availability: req.delivery.availability,
      metrics: req.delivery.metrics,
      earnings: req.delivery.earnings,
      wallet: req.delivery.wallet,
      level: req.delivery.level,
      lastLogin: req.delivery.lastLogin
    }
  });
});

/**
 * Update FCM Token for already-logged-in delivery partner
 * PUT /api/delivery/auth/update-fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken, platform = 'web' } = req.body;

  if (!fcmToken) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  // Use the delivery partner instance or user instance already attached by middleware
  // Universal authenticate middleware attaches to req.user, deliveryAuth attaches to req.delivery
  const target = req.delivery || req.user;

  if (!target) {
    return errorResponse(res, 404, 'User/Delivery partner not found');
  }

  // Update FCM token and platform
  target.platform = platform;
  if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
    target.fcmTokenMobile = fcmToken;
  } else {
    target.fcmToken = fcmToken;
  }

  await target.save();
  console.log(`[PUSH-NOTIFICATION] FCM Token refreshed for ${target.role || 'delivery'} ${target._id}: ${fcmToken} (${platform})`);

  return successResponse(res, 200, 'FCM token updated successfully');
});
