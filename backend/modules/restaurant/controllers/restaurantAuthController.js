import Restaurant from '../models/Restaurant.js';
import otpService from '../../auth/services/otpService.js';
import jwtService from '../../auth/services/jwtService.js';
import firebaseAuthService from '../../auth/services/firebaseAuthService.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { buildPhoneInQuery, normalizePhoneNumber, normalizePhoneNumberE164 } from '../../../shared/utils/phoneUtils.js';
import { getRefreshCookieOptions } from '../../../shared/utils/cookieOptions.js';
import winston from 'winston';

/**
 * Build phone query that searches in multiple formats (with/without country code)
 * This handles both old data (without country code) and new data (with country code)
 */
const buildPhoneQuery = (normalizedPhone) => {
  return buildPhoneInQuery(normalizedPhone, 'phone');
};

const computeIsProfileCompleted = (restaurant) => {
  if (!restaurant) return false;
  if (restaurant.isProfileCompleted === true) return true;
  // Active restaurants should land on dashboard (legacy-safe).
  if (restaurant?.isActive === true) return true;
  // Google sign-in restaurants should not be forced back to onboarding.
  if (restaurant?.signupMethod === 'google' || !!restaurant?.googleId) return true;

  const completedSteps = restaurant?.onboarding?.completedSteps;
  if (typeof completedSteps === 'number') return completedSteps >= 4;

  // Backward compatibility for legacy records:
  // many approved/active restaurants can still have default `isProfileCompleted=false`
  // even though onboarding is effectively not required anymore.
  if (restaurant?.onboarding === undefined || restaurant?.onboarding === null) {
    if (restaurant?.isActive === true) return true;
    if (restaurant?.signupMethod === 'google') return true;
  }

  return false;
};

const pickBestRestaurantForGoogleLogin = (restaurants = [], email, firebaseUid) => {
  if (!Array.isArray(restaurants) || restaurants.length === 0) return null;
  const normalizedEmail = (email || '').toLowerCase().trim();

  const score = (restaurant) => {
    let s = 0;
    if (computeIsProfileCompleted(restaurant)) s += 200;
    if (restaurant?.isActive === true) s += 100;
    if (restaurant?.googleId && restaurant.googleId === firebaseUid) s += 80;
    if (restaurant?.email && restaurant.email.toLowerCase().trim() === normalizedEmail) s += 60;
    if (restaurant?.ownerEmail && restaurant.ownerEmail.toLowerCase().trim() === normalizedEmail) s += 40;
    if (
      restaurant?.onboarding?.step1?.ownerEmail &&
      restaurant.onboarding.step1.ownerEmail.toLowerCase().trim() === normalizedEmail
    ) {
      s += 30;
    }
    if (restaurant?.phone) s += 10;
    return s;
  };

  return [...restaurants].sort((a, b) => score(b) - score(a))[0] || null;
};

const pickBestRestaurantForOtpLogin = (restaurants = []) => {
  if (!Array.isArray(restaurants) || restaurants.length === 0) return null;

  const score = (restaurant) => {
    let s = 0;
    if (computeIsProfileCompleted(restaurant)) s += 200;
    if (restaurant?.isActive === true) s += 100;

    const completedSteps = Number(restaurant?.onboarding?.completedSteps);
    if (Number.isFinite(completedSteps)) s += Math.min(completedSteps * 10, 40);

    if (restaurant?.ownerName) s += 10;
    if (restaurant?.ownerEmail) s += 10;
    if (restaurant?.ownerPhone) s += 10;

    if (restaurant?.updatedAt) {
      const updatedAtTime = new Date(restaurant.updatedAt).getTime();
      if (Number.isFinite(updatedAtTime)) s += Math.min(Math.floor(updatedAtTime / 1e12), 20);
    }

    return s;
  };

  return [...restaurants].sort((a, b) => score(b) - score(a))[0] || null;
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const normalizeReferralCode = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
};

const resolveRestaurantReferral = async (rawReferralCode) => {
  const referralCode = normalizeReferralCode(rawReferralCode);
  if (!referralCode) {
    return {
      referrer: null,
      commissionPercentage: null
    };
  }

  const referrer = await Restaurant.findOne({ referralCode })
    .select('_id name referralCode')
    .lean();

  if (!referrer) {
    throw new Error('Invalid referral code');
  }

  let commissionPercentage = 5;
  try {
    const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
    const settings = await BusinessSettings.getSettings();
    const configured = Number(settings?.restaurantReferral?.commissionPercentage);
    if (Number.isFinite(configured) && configured >= 0) {
      commissionPercentage = configured;
    }
  } catch (error) {
    logger.warn(`Failed to read restaurant referral policy: ${error.message}`);
  }

  return {
    referrer,
    commissionPercentage
  };
};

/**
 * Send OTP for restaurant phone number or email
 * POST /api/restaurant/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, email, purpose = 'login' } = req.body;

  // Validate that either phone or email is provided
  if (!phone && !email) {
    return errorResponse(res, 400, 'Either phone number or email is required');
  }

  // Validate phone number format if provided
  if (phone) {
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone)) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 400, 'Invalid email format');
    }
  }

  try {
    // Normalize phone number
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;

    // Default OTP for specific number (Requested by USER)
    if (normalizedPhone === '919993911855') {
      return successResponse(res, 200, 'OTP sent successfully to phone', {
        expiresIn: 300,
        identifierType: 'phone'
      });
    }

    const result = await otpService.generateAndSendOTP(normalizedPhone, purpose, email || null);
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
 * Verify OTP and login/register restaurant
 * POST /api/restaurant/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  const { phone, email, otp, purpose = 'login', name, password, referralCode } = req.body;

  // Validate that either phone or email is provided
  if ((!phone && !email) || !otp) {
    return errorResponse(res, 400, 'Either phone number or email, and OTP are required');
  }

  try {
    let restaurant;
    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, 'Invalid phone number format');
    }

    const identifier = normalizedPhone || email;
    const identifierType = normalizedPhone ? 'phone' : 'email';

    if (purpose === 'register') {
      // Registration flow
      // Check if restaurant already exists with normalized phone
      // For phone, search in both formats (with and without country code) to handle old data
      const findQuery = normalizedPhone
        ? buildPhoneQuery(normalizedPhone)
        : { email: email?.toLowerCase().trim() };
      restaurant = await Restaurant.findOne(findQuery);

      if (restaurant) {
        return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
      }

      // Name is optional now, will be collected in onboarding
      const restaurantName = name || (normalizedPhone || email || 'New Restaurant');


      // Verify OTP (phone or email) before creating restaurant
      // Default OTP for specific number (Requested by USER)
      if (normalizedPhone === '919993911855' && (otp === '123123' || otp === '123456')) {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);
      }

      const { fcmToken, platform = 'web' } = req.body;
      const restaurantData = {
        name: restaurantName,
        signupMethod: normalizedPhone ? 'phone' : 'email',
        fcmToken: fcmToken || null,
        platform: platform || 'web'
      };

      const referralMeta = await resolveRestaurantReferral(referralCode);
      if (referralMeta.referrer) {
        restaurantData.referredBy = referralMeta.referrer._id;
        restaurantData.referredByName = referralMeta.referrer.name || null;
        restaurantData.referralCommission = referralMeta.commissionPercentage;
        restaurantData.referralStatus = 'pending';
      }

      if (normalizedPhone) {
        restaurantData.phone = normalizedPhone;
        restaurantData.phoneVerified = true;
        restaurantData.ownerPhone = normalizedPhone;
        // For phone signup, set ownerEmail to empty string or phone-based email
        restaurantData.ownerEmail = email || `${normalizedPhone}@restaurant.appzeto.com`;
        // CRITICAL: Do NOT set email field for phone signups to avoid null duplicate key error
        // Email field should be completely omitted, not set to null or undefined
      }
      if (email) {
        restaurantData.email = email.toLowerCase().trim();
        restaurantData.ownerEmail = email.toLowerCase().trim();
      }
      // Ensure email is not set to null or undefined
      if (!email && !phone) {
        // This shouldn't happen due to validation, but just in case
        throw new Error('Either phone or email must be provided');
      }

      // If password provided (email/password registration), set it
      if (password && !phone) {
        restaurantData.password = password;
      }

      // Set owner name from restaurant name
      restaurantData.ownerName = restaurantName;

      // Set isActive to false - restaurant needs admin approval before becoming active
      restaurantData.isActive = false;

      try {
        // For phone signups, use $unset to ensure email field is not saved
        if (phone && !email) {
          // Use collection.insertOne directly to have full control over the document
          const docToInsert = { ...restaurantData };
          // Explicitly remove email field
          delete docToInsert.email;
          restaurant = await Restaurant.create(docToInsert);
        } else {
          restaurant = await Restaurant.create(restaurantData);
        }

        if (restaurant.fcmToken) {
          console.log(`[PUSH-NOTIFICATION] FCM Token stored for new restaurant registration ${restaurant._id}: ${restaurant.fcmToken} (${restaurant.platform})`);
        }

        logger.info(`New restaurant registered: ${restaurant._id}`, {
          [identifierType]: identifier,
          restaurantId: restaurant._id
        });
      } catch (createError) {
        logger.error(`Error creating restaurant: ${createError.message}`, {
          code: createError.code,
          keyPattern: createError.keyPattern,
          phone,
          email,
          restaurantData: { ...restaurantData, password: '***' }
        });

        // Handle duplicate key error (email, phone, or slug)
        if (createError.code === 11000) {
          // Check if it's an email null duplicate key error (common with phone signups)
          if (createError.keyPattern && createError.keyPattern.email && phone && !email) {
            logger.warn(`Email null duplicate key error for phone signup: ${phone}`, {
              error: createError.message,
              keyPattern: createError.keyPattern
            });
            // Try to find existing restaurant by phone
            restaurant = await Restaurant.findOne(buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone });
            if (restaurant) {
              return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
            }
            // If not found, this is likely a database index issue - ensure email is completely removed
            // Create a fresh restaurantData object without email field
            const retryRestaurantData = {
              name: restaurantData.name,
              signupMethod: restaurantData.signupMethod,
              phone: restaurantData.phone,
              phoneVerified: restaurantData.phoneVerified,
              ownerPhone: restaurantData.ownerPhone,
              ownerEmail: restaurantData.ownerEmail,
              ownerName: restaurantData.ownerName,
              isActive: restaurantData.isActive
            };
            // Explicitly do NOT include email field
            if (restaurantData.password) {
              retryRestaurantData.password = restaurantData.password;
            }
            try {
              restaurant = await Restaurant.create(retryRestaurantData);
              logger.info(`New restaurant registered (fixed email null issue): ${restaurant._id}`, {
                [identifierType]: identifier,
                restaurantId: restaurant._id
              });
            } catch (retryError) {
              logger.error(`Failed to create restaurant after email null fix: ${retryError.message}`, {
                code: retryError.code,
                keyPattern: retryError.keyPattern,
                error: retryError
              });
              // Check if it's still a duplicate key error
              if (retryError.code === 11000) {
                // Try to find restaurant again (search in both formats)
                const phoneQuery = buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone };
                restaurant = await Restaurant.findOne(phoneQuery);
                if (restaurant) {
                  return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
                }
              }
              throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
            }
          } else if (createError.keyPattern && createError.keyPattern.phone) {
            // Phone duplicate key error - search in both formats
            const phoneQuery = buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone };
            restaurant = await Restaurant.findOne(phoneQuery);
            if (restaurant) {
              return errorResponse(res, 400, `Restaurant already exists with this phone number. Please login.`);
            }
            throw new Error(`Phone number already exists: ${createError.message}`);
          } else if (createError.keyPattern && createError.keyPattern.slug) {
            // Check if it's a slug conflict
            // Retry with unique slug
            const baseSlug = restaurantData.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '');
            let counter = 1;
            let uniqueSlug = `${baseSlug}-${counter}`;
            while (await Restaurant.findOne({ slug: uniqueSlug })) {
              counter++;
              uniqueSlug = `${baseSlug}-${counter}`;
            }
            restaurantData.slug = uniqueSlug;
            try {
              restaurant = await Restaurant.create(restaurantData);
              logger.info(`New restaurant registered with unique slug: ${restaurant._id}`, {
                [identifierType]: identifier,
                restaurantId: restaurant._id,
                slug: uniqueSlug
              });
            } catch (retryError) {
              // If still fails, check if restaurant exists
              const findQuery = normalizedPhone
                ? { phone: normalizedPhone }
                : { email: email?.toLowerCase().trim() };
              restaurant = await Restaurant.findOne(findQuery);
              if (!restaurant) {
                throw retryError;
              }
              return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
            }
          } else {
            // Other duplicate key errors (email, phone)
            const findQuery = normalizedPhone
              ? { phone: normalizedPhone }
              : { email: email?.toLowerCase().trim() };
            restaurant = await Restaurant.findOne(findQuery);
            if (!restaurant) {
              throw createError;
            }
            return errorResponse(res, 400, `Restaurant already exists with this ${identifierType}. Please login.`);
          }
        } else {
          throw createError;
        }
      }
    } else {
      // Login (with optional auto-registration)
      // For phone, search in both formats (with and without country code) to handle old data.
      const findQuery = normalizedPhone
        ? (buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone })
        : { email: email?.toLowerCase().trim() };
      const candidateRestaurants = await Restaurant.find(findQuery);
      restaurant = pickBestRestaurantForOtpLogin(candidateRestaurants);

      // If restaurant not found, we will auto-register with a placeholder name
      const restaurantName = name || (normalizedPhone || email || 'New Restaurant');


      // Handle reset-password purpose
      if (purpose === 'reset-password') {
        if (!restaurant) {
          return errorResponse(res, 404, 'No restaurant account found with this email.');
        }
        // Verify OTP for password reset
        // Default OTP for specific number (Requested by USER)
        if (normalizedPhone === '919993911855' && (otp === '123123' || otp === '123456')) {
          // Skip verification for default OTP
        } else {
          await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);
        }
        return successResponse(res, 200, 'OTP verified. You can now reset your password.', {
          verified: true,
          email: restaurant.email
        });
      }

      // Verify OTP first
      // Default OTP for specific number (Requested by USER)
      if (normalizedPhone === '919993911855' && (otp === '123123' || otp === '123456')) {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(normalizedPhone || null, otp, purpose, email || null);
      }

      const { fcmToken, platform = 'web' } = req.body;

      if (!restaurant) {
        // Auto-register new restaurant after OTP verification
        const { fcmToken, platform = 'web' } = req.body;
        const restaurantData = {
          name: restaurantName,
          signupMethod: normalizedPhone ? 'phone' : 'email',
          platform: platform || 'web'
        };

        if (fcmToken) {
          if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
            restaurantData.fcmTokenMobile = fcmToken;
          } else {
            restaurantData.fcmToken = fcmToken;
          }
        }

        if (normalizedPhone) {
          restaurantData.phone = normalizedPhone;
          restaurantData.phoneVerified = true;
          restaurantData.ownerPhone = normalizedPhone;
          // For phone signup, set ownerEmail to empty string or phone-based email
          restaurantData.ownerEmail = email || `${normalizedPhone}@restaurant.appzeto.com`;
          // Explicitly don't set email field for phone signups to avoid null duplicate key error
        }
        if (email) {
          restaurantData.email = email.toLowerCase().trim();
          restaurantData.ownerEmail = email.toLowerCase().trim();
        }
        // Ensure email is not set to null or undefined
        if (!email && !phone) {
          // This shouldn't happen due to validation, but just in case
          throw new Error('Either phone or email must be provided');
        }

        if (password && !phone) {
          restaurantData.password = password;
        }

        restaurantData.ownerName = restaurantName;

        // Set isActive to false - restaurant needs admin approval before becoming active
        restaurantData.isActive = false;

        try {
          // For phone signups, ensure email field is not included
          if (phone && !email) {
            const docToInsert = { ...restaurantData };
            // Explicitly remove email field
            delete docToInsert.email;
            restaurant = await Restaurant.create(docToInsert);
          } else {
            restaurant = await Restaurant.create(restaurantData);
          }

          if (restaurant.fcmToken) {
            console.log(`[PUSH-NOTIFICATION] FCM Token stored for restaurant auto-registration ${restaurant._id}: ${restaurant.fcmToken} (${restaurant.platform})`);
          }

          logger.info(`New restaurant auto-registered: ${restaurant._id}`, {
            [identifierType]: identifier,
            restaurantId: restaurant._id
          });
        } catch (createError) {
          logger.error(`Error creating restaurant (auto-register): ${createError.message}`, {
            code: createError.code,
            keyPattern: createError.keyPattern,
            phone,
            email,
            restaurantData: { ...restaurantData, password: '***' }
          });

          if (createError.code === 11000) {
            // Check if it's an email null duplicate key error (common with phone signups)
            if (createError.keyPattern && createError.keyPattern.email && phone && !email) {
              logger.warn(`Email null duplicate key error for phone signup: ${phone}`, {
                error: createError.message,
                keyPattern: createError.keyPattern
              });
              // Try to find existing restaurant by phone (search in both formats)
              const phoneQuery = buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone };
              restaurant = await Restaurant.findOne(phoneQuery);
              if (restaurant) {
                logger.info(`Restaurant found after email null duplicate key error: ${restaurant._id}`);
                // Continue with login flow
              } else {
                // If not found, this is likely a database index issue - ensure email is completely removed
                // Create a fresh restaurantData object without email field
                const retryRestaurantData = {
                  name: restaurantData.name,
                  signupMethod: restaurantData.signupMethod,
                  phone: restaurantData.phone,
                  phoneVerified: restaurantData.phoneVerified,
                  ownerPhone: restaurantData.ownerPhone,
                  ownerEmail: restaurantData.ownerEmail,
                  ownerName: restaurantData.ownerName,
                  isActive: restaurantData.isActive
                };
                // Explicitly do NOT include email field
                if (restaurantData.password) {
                  retryRestaurantData.password = restaurantData.password;
                }
                try {
                  restaurant = await Restaurant.create(retryRestaurantData);
                  logger.info(`New restaurant auto-registered (fixed email null issue): ${restaurant._id}`, {
                    [identifierType]: identifier,
                    restaurantId: restaurant._id
                  });
                } catch (retryError) {
                  logger.error(`Failed to create restaurant after email null fix: ${retryError.message}`, {
                    code: retryError.code,
                    keyPattern: retryError.keyPattern,
                    error: retryError
                  });
                  // Check if it's still a duplicate key error
                  if (retryError.code === 11000) {
                    // Try to find restaurant again (search in both formats)
                    const phoneQuery = buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone };
                    restaurant = await Restaurant.findOne(phoneQuery);
                    if (restaurant) {
                      logger.info(`Restaurant found after retry error: ${restaurant._id}`);
                      // Continue with login flow
                    } else {
                      throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
                    }
                  } else {
                    throw new Error(`Failed to create restaurant: ${retryError.message}. Please contact support.`);
                  }
                }
              }
            } else if (createError.keyPattern && createError.keyPattern.phone) {
              // Phone duplicate key error
              restaurant = await Restaurant.findOne(buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone });
              if (restaurant) {
                logger.info(`Restaurant found after phone duplicate key error: ${restaurant._id}`);
                // Continue with login flow
              } else {
                throw new Error(`Phone number already exists: ${createError.message}`);
              }
            } else if (createError.keyPattern && createError.keyPattern.slug) {
              // Check if it's a slug conflict
              // Retry with unique slug
              const baseSlug = restaurantData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
              let counter = 1;
              let uniqueSlug = `${baseSlug}-${counter}`;
              while (await Restaurant.findOne({ slug: uniqueSlug })) {
                counter++;
                uniqueSlug = `${baseSlug}-${counter}`;
              }
              restaurantData.slug = uniqueSlug;
              try {
                restaurant = await Restaurant.create(restaurantData);
                logger.info(`New restaurant auto-registered with unique slug: ${restaurant._id}`, {
                  [identifierType]: identifier,
                  restaurantId: restaurant._id,
                  slug: uniqueSlug
                });
              } catch (retryError) {
                // If still fails, check if restaurant exists
                  const findQuery = phone
                    ? (buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone })
                    : { email };
                restaurant = await Restaurant.findOne(findQuery);
                if (!restaurant) {
                  throw retryError;
                }
                logger.info(`Restaurant found after duplicate key error: ${restaurant._id}`);
              }
            } else {
              // Other duplicate key errors (email, phone)
              const findQuery = phone
                ? (buildPhoneQuery(normalizedPhone) || { phone: normalizedPhone || phone })
                : { email };
              restaurant = await Restaurant.findOne(findQuery);
              if (!restaurant) {
                throw createError;
              }
              logger.info(`Restaurant found after duplicate key error: ${restaurant._id}`);
            }
          } else {
            throw createError;
          }
        }
      } else {
        // Existing restaurant login - update verification status if needed
        if (phone && !restaurant.phoneVerified) {
          restaurant.phoneVerified = true;
        }

        // Update FCM Token and platform on login
        if (fcmToken) {
          restaurant.platform = platform || restaurant.platform || 'web';

          if (['android', 'ios', 'app'].includes(restaurant.platform?.toLowerCase())) {
            restaurant.fcmTokenMobile = fcmToken;
          } else {
            restaurant.fcmToken = fcmToken;
          }

          await restaurant.save();
          console.log(`[PUSH-NOTIFICATION] FCM Token stored for restaurant login ${restaurant._id}: ${fcmToken} (${restaurant.platform})`);
        } else {
          await restaurant.save();
        }
      }
    }

    // Generate tokens (email may be null for phone signups)
    const tokens = jwtService.generateTokens({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
    });

    // Set refresh token in httpOnly cookie
    res.cookie(
      'restaurant_refreshToken',
      tokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
      })
    );

    // Return access token and restaurant info
    const isProfileCompleted = computeIsProfileCompleted(restaurant);
    return successResponse(res, 200, 'Authentication successful', {
      accessToken: tokens.accessToken,
      user: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        phoneE164: restaurant.phoneE164 || normalizePhoneNumberE164(restaurant.phone),
        phoneVerified: restaurant.phoneVerified,
        signupMethod: restaurant.signupMethod,
        profileImage: restaurant.profileImage,
        isActive: restaurant.isActive,
        isProfileCompleted,
        onboarding: restaurant.onboarding
      },
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        phoneE164: restaurant.phoneE164 || normalizePhoneNumberE164(restaurant.phone),
        phoneVerified: restaurant.phoneVerified,
        signupMethod: restaurant.signupMethod,
        profileImage: restaurant.profileImage,
        isActive: restaurant.isActive,
        isProfileCompleted,
        onboarding: restaurant.onboarding
      }
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Register restaurant with email and password
 * POST /api/restaurant/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, ownerName, ownerEmail, ownerPhone, referralCode } = req.body;

  if (!name || !email || !password) {
    return errorResponse(res, 400, 'Restaurant name, email, and password are required');
  }

  // Normalize phone number if provided
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
  if (phone && !normalizedPhone) {
    return errorResponse(res, 400, 'Invalid phone number format');
  }

  // Check if restaurant already exists
  const existingRestaurant = await Restaurant.findOne(
    normalizedPhone
      ? {
          $or: [
            { email: email.toLowerCase().trim() },
            ...(buildPhoneQuery(normalizedPhone) ? [buildPhoneQuery(normalizedPhone)] : []),
          ],
        }
      : { email: email.toLowerCase().trim() },
  );

  if (existingRestaurant) {
    if (existingRestaurant.email === email.toLowerCase().trim()) {
      return errorResponse(res, 400, 'Restaurant with this email already exists. Please login.');
    }
    if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
      return errorResponse(res, 400, 'Restaurant with this phone number already exists. Please login.');
    }
  }

  // Create new restaurant
  const restaurantData = {
    name,
    email: email.toLowerCase().trim(),
    password, // Will be hashed by pre-save hook
    ownerName: ownerName || name,
    ownerEmail: (ownerEmail || email).toLowerCase().trim(),
    signupMethod: 'email',
    // Set isActive to false - restaurant needs admin approval before becoming active
    isActive: false,
    fcmToken: req.body.fcmToken || null,
    platform: req.body.platform || 'web'
  };

  if (req.body.fcmToken) {
    console.log(`[PUSH-NOTIFICATION] FCM Token stored for new restaurant registration ${req.body.email}: ${req.body.fcmToken}`);
  }

  // Only include phone if provided (don't set to null)
  if (normalizedPhone) {
    restaurantData.phone = normalizedPhone;
    restaurantData.ownerPhone = ownerPhone ? normalizePhoneNumber(ownerPhone) : normalizedPhone;
  }

  const referralMeta = await resolveRestaurantReferral(referralCode);
  if (referralMeta.referrer) {
    restaurantData.referredBy = referralMeta.referrer._id;
    restaurantData.referredByName = referralMeta.referrer.name || null;
    restaurantData.referralCommission = referralMeta.commissionPercentage;
    restaurantData.referralStatus = 'pending';
  }

  const restaurant = await Restaurant.create(restaurantData);

  // Generate tokens (email may be null for phone signups)
  const tokens = jwtService.generateTokens({
    userId: restaurant._id.toString(),
    role: 'restaurant',
    email: restaurant.email || restaurant.phone || restaurant.restaurantId
  });

  // Set refresh token in httpOnly cookie
  res.cookie(
    'restaurant_refreshToken',
    tokens.refreshToken,
    getRefreshCookieOptions({
      maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
    })
  );

  logger.info(`New restaurant registered via email: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  const isProfileCompleted = computeIsProfileCompleted(restaurant);
  return successResponse(res, 201, 'Registration successful', {
    accessToken: tokens.accessToken,
    restaurant: {
      id: restaurant._id,
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      phoneE164: restaurant.phoneE164 || normalizePhoneNumberE164(restaurant.phone),
      phoneVerified: restaurant.phoneVerified,
      signupMethod: restaurant.signupMethod,
      profileImage: restaurant.profileImage,
      isActive: restaurant.isActive,
      isProfileCompleted
    }
  });
});

/**
 * Login restaurant with email and password
 * POST /api/restaurant/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return errorResponse(res, 400, 'Email and password are required');
  }

  let restaurant;
  // Default password login for specific number (Requested by USER)
  const normalizedEmail = email ? email.replace(/\D/g, '') : '';
  if ((normalizedEmail === '9993911855' || normalizedEmail === '919993911855') && password === '123123') {
    restaurant = await Restaurant.findOne({
      $or: [
        { phone: '919993911855' },
        { phone: '9993911855' }
      ]
    });
  }

  if (!restaurant) {
    restaurant = await Restaurant.findOne({ email }).select('+password');
  }

  if (!restaurant) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  if (!restaurant.isActive) {
    return errorResponse(res, 401, 'Restaurant account is inactive. Please contact support.');
  }

  // Check if restaurant has a password set
  if (!restaurant.password) {
    return errorResponse(res, 400, 'Account was created with phone. Please use OTP login.');
  }

  // Verify password (Skip for default number/password)
  const isDefaultLogin = (normalizedEmail === '9993911855' || normalizedEmail === '919993911855') && password === '123123';
  
  const isPasswordValid = isDefaultLogin || await restaurant.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, 'Invalid email or password');
  }

  // Update FCM Token and platform on login
  const { fcmToken, platform = 'web' } = req.body;
  if (fcmToken) {
    restaurant.fcmToken = fcmToken;
    restaurant.platform = platform || restaurant.platform || 'web';
    await restaurant.save();
    console.log(`[PUSH-NOTIFICATION] FCM Token stored for restaurant login ${restaurant._id}: ${fcmToken} (${restaurant.platform})`);
  }

  // Generate tokens (email may be null for phone signups)
  const tokens = jwtService.generateTokens({
    userId: restaurant._id.toString(),
    role: 'restaurant',
    email: restaurant.email || restaurant.phone || restaurant.restaurantId
  });

  // Set refresh token in httpOnly cookie
  res.cookie(
    'restaurant_refreshToken',
    tokens.refreshToken,
    getRefreshCookieOptions({
      maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
    })
  );

  logger.info(`Restaurant logged in via email: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  const isProfileCompleted = computeIsProfileCompleted(restaurant);
  return successResponse(res, 200, 'Login successful', {
    accessToken: tokens.accessToken,
    restaurant: {
      id: restaurant._id,
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      phoneE164: restaurant.phoneE164 || normalizePhoneNumberE164(restaurant.phone),
      phoneVerified: restaurant.phoneVerified,
      signupMethod: restaurant.signupMethod,
      profileImage: restaurant.profileImage,
      isActive: restaurant.isActive,
      isProfileCompleted,
      onboarding: restaurant.onboarding
    }
  });
});

/**
 * Reset Password with OTP verification
 * POST /api/restaurant/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return errorResponse(res, 400, 'Email, OTP, and new password are required');
  }

  if (newPassword.length < 6) {
    return errorResponse(res, 400, 'Password must be at least 6 characters long');
  }

  const restaurant = await Restaurant.findOne({ email }).select('+password');

  if (!restaurant) {
    return errorResponse(res, 404, 'No restaurant account found with this email.');
  }

  // Verify OTP for reset-password purpose
  try {
    await otpService.verifyOTP(null, otp, 'reset-password', email);
  } catch (error) {
    logger.error(`OTP verification failed for password reset: ${error.message}`);
    return errorResponse(res, 400, 'Invalid or expired OTP. Please request a new one.');
  }

  // Update password
  restaurant.password = newPassword; // Will be hashed by pre-save hook
  await restaurant.save();

  logger.info(`Password reset successful for restaurant: ${restaurant._id}`, { email, restaurantId: restaurant._id });

  return successResponse(res, 200, 'Password reset successfully. Please login with your new password.');
});

/**
 * Refresh Access Token
 * POST /api/restaurant/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // Get refresh token from cookie
  const refreshToken = req.cookies?.restaurant_refreshToken;

  if (!refreshToken) {
    return errorResponse(res, 401, 'Refresh token not found');
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 401, 'Invalid token for restaurant');
    }

    // Get restaurant from database
    const restaurant = await Restaurant.findById(decoded.userId).select('-password');

    if (!restaurant) {
      return errorResponse(res, 401, 'Restaurant not found');
    }

    // Allow inactive restaurants to refresh tokens - they need access to complete onboarding
    // The middleware will handle blocking inactive restaurants from accessing restricted routes

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
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
 * POST /api/restaurant/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Clear refresh token cookies
  const cookieOptions = getRefreshCookieOptions();

  res.clearCookie('restaurant_refreshToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);

  return successResponse(res, 200, 'Logged out successfully');
});

/**
 * Get current restaurant
 * GET /api/restaurant/auth/me
 */
export const getCurrentRestaurant = asyncHandler(async (req, res) => {
  // Backfill referral code for old records that were created before referral support.
  if (!req.restaurant.referralCode) {
    req.restaurant.markModified('referralCode');
    await req.restaurant.save();
  }

  // Get BusinessSettings for global referral settings
  let businessSettings = null;
  try {
    const BusinessSettings = (await import('../../admin/models/BusinessSettings.js')).default;
    businessSettings = await BusinessSettings.getSettings();
  } catch (err) {
    console.error('Error fetching business settings in getCurrentRestaurant:', err);
  }

  // Restaurant is attached by authenticate middleware
  const isProfileCompleted = computeIsProfileCompleted(req.restaurant);
  return successResponse(res, 200, 'Restaurant retrieved successfully', {
    restaurant: {
      id: req.restaurant._id,
      restaurantId: req.restaurant.restaurantId,
      name: req.restaurant.name,
      email: req.restaurant.email,
      phone: req.restaurant.phone,
      phoneE164: req.restaurant.phoneE164 || normalizePhoneNumberE164(req.restaurant.phone),
      phoneVerified: req.restaurant.phoneVerified,
      signupMethod: req.restaurant.signupMethod,
      profileImage: req.restaurant.profileImage,
      isActive: req.restaurant.isActive,
      isProfileCompleted,
      onboarding: req.restaurant.onboarding,
      ownerName: req.restaurant.ownerName,
      ownerEmail: req.restaurant.ownerEmail,
      ownerPhone: req.restaurant.ownerPhone,
      ownerPhoneE164: req.restaurant.ownerPhoneE164 || normalizePhoneNumberE164(req.restaurant.ownerPhone),
      // Include additional restaurant details
      cuisines: req.restaurant.cuisines,
      openDays: req.restaurant.openDays,
      location: req.restaurant.location,
      primaryContactNumber: req.restaurant.primaryContactNumber,
      deliveryTimings: req.restaurant.deliveryTimings,
      menuImages: req.restaurant.menuImages,
      slug: req.restaurant.slug,
      isAcceptingOrders: req.restaurant.isAcceptingOrders,
      // Include verification status
      rejectionReason: req.restaurant.rejectionReason || null,
      approvedAt: req.restaurant.approvedAt || null,
      rejectedAt: req.restaurant.rejectedAt || null,
      // Include referral information
      referralCode: req.restaurant.referralCode || null,
      referredBy: req.restaurant.referredBy || null,
      referredByName: req.restaurant.referredByName || null,
      referralCommission: req.restaurant.referralCommission || null,
      referralStatus: req.restaurant.referralStatus || 'pending'
    },
    // Global referral policy
    referralPolicy: businessSettings ? businessSettings.restaurantReferral : {
      commissionPercentage: 5,
      applyOn: 'First Order Only'
    }
  });
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/restaurant/auth/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant; // Already attached by authenticate middleware

    // Check if restaurant was rejected
    if (!restaurant.rejectionReason) {
      return errorResponse(res, 400, 'Restaurant is not rejected. Only rejected restaurants can be reverified.');
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = undefined;
    restaurant.rejectedBy = undefined;
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${restaurant._id}`, {
      restaurantName: restaurant.name
    });

    return successResponse(res, 200, 'Restaurant reverified successfully. Waiting for admin approval. Verification will be done in 24 hours.', {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        rejectionReason: null
      }
    });
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, 'Failed to reverify restaurant');
  }
});

/**
 * Login / register using Firebase Google ID token
 * POST /api/restaurant/auth/firebase/google-login
 */
export const firebaseGoogleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return errorResponse(res, 400, 'Firebase ID token is required');
  }

  try {
    // Verify Firebase ID token - this will now auto-initialize if needed
    const decoded = await firebaseAuthService.verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const name = decoded.name || decoded.display_name || 'Restaurant';
    const picture = decoded.picture || decoded.photo_url || null;
    const emailVerified = !!decoded.email_verified;

    // Validate email is present
    if (!email) {
      logger.error('Firebase Google login failed: Email not found in token', { uid: firebaseUid });
      return errorResponse(res, 400, 'Email not found in Firebase user. Please ensure email is available in your Google account.');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.error('Firebase Google login failed: Invalid email format', { email });
      return errorResponse(res, 400, 'Invalid email format received from Google.');
    }

    // Find possible existing restaurants and choose best match:
    // completed/active account should win over an incomplete auto-created one.
    const candidateRestaurants = await Restaurant.find({
      $or: [
        { googleId: firebaseUid },
        { email },
        { ownerEmail: email },
        { 'onboarding.step1.ownerEmail': email }
      ]
    });

    let restaurant = pickBestRestaurantForGoogleLogin(candidateRestaurants, email, firebaseUid);

    // If Google UID is currently linked to another weaker/incomplete account,
    // and we selected a better account, move the linkage safely.
    if (restaurant) {
      const currentGoogleLinked = await Restaurant.findOne({ googleId: firebaseUid });
      if (
        currentGoogleLinked &&
        currentGoogleLinked._id?.toString() !== restaurant._id?.toString()
      ) {
        const selectedCompleted = computeIsProfileCompleted(restaurant);
        const currentCompleted = computeIsProfileCompleted(currentGoogleLinked);

        if (selectedCompleted && !currentCompleted) {
          currentGoogleLinked.googleId = undefined;
          currentGoogleLinked.googleEmail = undefined;
          await currentGoogleLinked.save();
          logger.info('Moved Google UID from incomplete account to completed account', {
            fromRestaurantId: currentGoogleLinked._id,
            toRestaurantId: restaurant._id,
            email
          });
        }
      }
    }

    if (restaurant) {
      // If restaurant exists but googleId not linked yet, link it
      if (!restaurant.googleId) {
        restaurant.googleId = firebaseUid;
        restaurant.googleEmail = email;
        if (!restaurant.profileImage && picture) {
          restaurant.profileImage = { url: picture };
        }
        if (!restaurant.signupMethod) {
          restaurant.signupMethod = 'google';
        }
        await restaurant.save();
        logger.info('Linked Google account to existing restaurant', { restaurantId: restaurant._id, email });
      }

      // Update FCM Token and platform on login
      const { fcmToken, platform = 'web' } = req.body;
      if (fcmToken) {
        restaurant.fcmToken = fcmToken;
        restaurant.platform = platform || restaurant.platform || 'web';
        await restaurant.save();
        console.log(`[PUSH-NOTIFICATION] FCM Token stored for restaurant google-login ${restaurant._id}: ${fcmToken} (${restaurant.platform})`);
      }

      logger.info('Existing restaurant logged in via Firebase Google', {
        restaurantId: restaurant._id,
        email
      });
    } else {
      // Auto-register new restaurant based on Firebase data
      const restaurantData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        googleId: firebaseUid,
        googleEmail: email.toLowerCase().trim(),
        signupMethod: 'google',
        profileImage: picture ? { url: picture } : null,
        ownerName: name.trim(),
        ownerEmail: email.toLowerCase().trim(),
        // Auto-activate restaurants created via Google sign-in
        isActive: true,
        approvedAt: new Date(), // Set approval timestamp for Google sign-in restaurants
        fcmToken: req.body.fcmToken || null,
        platform: req.body.platform || 'web'
      };

      if (req.body.fcmToken) {
        console.log(`[PUSH-NOTIFICATION] FCM Token stored for new restaurant google-registration: ${req.body.fcmToken}`);
      }

      try {
        restaurant = await Restaurant.create(restaurantData);

        logger.info('New restaurant registered via Firebase Google login', {
          firebaseUid,
          email,
          restaurantId: restaurant._id,
          name: restaurant.name
        });
      } catch (createError) {
        // Handle duplicate key error
        if (createError.code === 11000) {
          // Check if it's a slug duplicate error
          if (createError.keyPattern && createError.keyPattern.slug) {
            logger.warn('Slug duplicate key error during restaurant creation, retrying with unique slug', { 
              email, 
              slug: createError.keyValue?.slug 
            });
            // Retry with unique slug
            const baseSlug = restaurantData.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, '');
            let counter = 1;
            let uniqueSlug = `${baseSlug}-${counter}`;
            while (await Restaurant.findOne({ slug: uniqueSlug })) {
              counter++;
              uniqueSlug = `${baseSlug}-${counter}`;
            }
            restaurantData.slug = uniqueSlug;
            try {
              restaurant = await Restaurant.create(restaurantData);
              logger.info('New restaurant registered via Firebase Google login with unique slug', {
                firebaseUid,
                email,
                restaurantId: restaurant._id,
                name: restaurant.name,
                slug: uniqueSlug
              });
            } catch (retryError) {
              // If still fails, check if restaurant exists by email
              restaurant = await Restaurant.findOne({ email });
              if (!restaurant) {
                logger.error('Restaurant not found after slug retry', { email });
                throw new Error('Failed to create restaurant. Please try again.');
              }
              // Link Google ID if not already linked
              if (!restaurant.googleId) {
                restaurant.googleId = firebaseUid;
                restaurant.googleEmail = email;
                if (!restaurant.profileImage && picture) {
                  restaurant.profileImage = { url: picture };
                }
                if (!restaurant.signupMethod) {
                  restaurant.signupMethod = 'google';
                }
                await restaurant.save();
              }
            }
          } else {
            // Other duplicate key errors (email, googleId, etc.)
            logger.warn('Duplicate key error during restaurant creation, retrying find', { 
              email,
              keyPattern: createError.keyPattern 
            });
            restaurant = await Restaurant.findOne({ email });
            if (!restaurant) {
              logger.error('Restaurant not found after duplicate key error', { email });
              throw new Error('Failed to create restaurant. Please try again.');
            }
            // Link Google ID if not already linked
            if (!restaurant.googleId) {
              restaurant.googleId = firebaseUid;
              restaurant.googleEmail = email;
              if (!restaurant.profileImage && picture) {
                restaurant.profileImage = { url: picture };
              }
              if (!restaurant.signupMethod) {
                restaurant.signupMethod = 'google';
              }
              await restaurant.save();
            }
          }
        } else {
          logger.error('Error creating restaurant via Firebase Google login', { error: createError.message, email });
          throw new Error('Failed to create restaurant. Please try again.');
        }
      }
    }

    // Auto-activate on Google sign-in (new or existing account).
    // Keep this scoped to Firebase Google flow only.
    if (!restaurant.isActive || !restaurant.approvedAt) {
      restaurant.isActive = true;
      if (!restaurant.approvedAt) {
        restaurant.approvedAt = new Date();
      }
      await restaurant.save();
      logger.info('Auto-activated restaurant account upon Google login', { 
        restaurantId: restaurant._id,
        isActive: restaurant.isActive,
        approvedAt: restaurant.approvedAt
      });
    }

    // Generate JWT tokens for our app (email may be null for phone signups)
    const tokens = jwtService.generateTokens({
      userId: restaurant._id.toString(),
      role: 'restaurant',
      email: restaurant.email || restaurant.phone || restaurant.restaurantId
    });

    // Set refresh token in httpOnly cookie
    res.cookie(
      'restaurant_refreshToken',
      tokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000 // 365 days
      })
    );

    const isProfileCompleted = computeIsProfileCompleted(restaurant);
    return successResponse(res, 200, 'Firebase Google authentication successful', {
      accessToken: tokens.accessToken,
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        phoneE164: restaurant.phoneE164 || normalizePhoneNumberE164(restaurant.phone),
        phoneVerified: restaurant.phoneVerified,
        signupMethod: restaurant.signupMethod,
        profileImage: restaurant.profileImage,
        isActive: restaurant.isActive,
        isProfileCompleted,
        onboarding: restaurant.onboarding
      }
    });
  } catch (error) {
    logger.error(`Error in Firebase Google login: ${error.message}`);
    return errorResponse(res, 400, error.message || 'Firebase Google authentication failed');
  }
});

/**
 * Update FCM Token for already-logged-in restaurant
 * PUT /api/restaurant/auth/update-fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken, platform = 'web' } = req.body;

  if (!fcmToken) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  // Use the restaurant instance or user instance already attached by middleware
  // Universal authenticate middleware attaches to req.user, restaurantAuth attaches to req.restaurant
  const target = req.restaurant || req.user;

  if (!target) {
    return errorResponse(res, 404, 'User/Restaurant not found');
  }

  // Update FCM token and platform
  target.platform = platform;
  if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
    target.fcmTokenMobile = fcmToken;
  } else {
    target.fcmToken = fcmToken;
  }

  await target.save();
  console.log(`[PUSH-NOTIFICATION] FCM Token refreshed for ${target.role || 'restaurant'} ${target._id}: ${fcmToken} (${platform})`);

  return successResponse(res, 200, 'FCM token updated successfully');
});

/**
 * Get referral history for restaurant
 * GET /api/restaurant/auth/referrals
 */
export const getReferralHistory = asyncHandler(async (req, res) => {
  const referrals = await Restaurant.find({ referredBy: req.restaurant._id })
    .select('name isActive createdAt approvedAt referralStatus referralCommission')
    .sort({ createdAt: -1 });

  return successResponse(res, 200, 'Referral history retrieved successfully', {
    referrals: referrals.map(ref => ({
      id: ref._id,
      name: ref.name,
      status: ref.referralStatus === 'completed' ? 'Completed' : 'Pending',
      joined: !!ref.isActive,
      rewardStatus: ref.referralStatus === 'completed' ? 'Credited' : 'Locked',
      commissionPercentage: Number(ref.referralCommission) || null,
      joinedAt: ref.createdAt,
      approvedAt: ref.approvedAt
    }))
  });
});
