import User from "../models/User.js";
import otpService from "../services/otpService.js";
import jwtService from "../services/jwtService.js";
import googleAuthService from "../services/googleAuthService.js";
import firebaseAuthService from "../services/firebaseAuthService.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import BusinessSettings from "../../admin/models/BusinessSettings.js";
import ReferralLog from "../../admin/models/ReferralLog.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import { getRefreshCookieOptions } from "../../../shared/utils/cookieOptions.js";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

/**
 * Build phone query that searches in multiple formats (with/without country code)
 * This handles both old data (without country code) and new data (with country code)
 */
const buildPhoneQuery = (normalizedPhone, role) => {
  if (!normalizedPhone) return null;

  let variants = [];
  // Check if normalized phone has country code (starts with 91 and is 12 digits)
  if (normalizedPhone.startsWith("91") && normalizedPhone.length === 12) {
    const phoneWithoutCountryCode = normalizedPhone.substring(2);
    variants = [
      normalizedPhone,
      phoneWithoutCountryCode,
      `+${normalizedPhone}`,
      `+91${phoneWithoutCountryCode}`,
    ];
  } else {
    // If it's already without country code, also check with country code
    variants = [
      normalizedPhone,
      `91${normalizedPhone}`,
      `+91${normalizedPhone}`,
      `+${normalizedPhone}`,
    ];
  }

  return {
    role,
    phone: { $in: variants },
  };
};

/**
 * Send OTP for phone number or email
 * POST /api/auth/send-otp
 */
export const sendOTP = asyncHandler(async (req, res) => {
  const { phone, email, purpose = "login" } = req.body;
  console.log(`[AUTH-CONTROLLER] Received sendOTP request:`, { phone, email, purpose });

  // Validate that either phone or email is provided
  if (!phone && !email) {
    return errorResponse(res, 400, "Either phone number or email is required");
  }

  // Validate phone number format if provided
  if (phone) {
    const phoneRegex =
      /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone)) {
      return errorResponse(res, 400, "Invalid phone number format");
    }
  }

  // Validate email format if provided
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse(res, 400, "Invalid email format");
    }
  }

  try {
    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;

    // Default OTP for specific number (Requested by USER)
    if (normalizedPhone === "917610416911" || normalizedPhone === "919009925021") {
      return successResponse(res, 200, "OTP sent successfully to phone", {
        expiresIn: 300,
        identifierType: "phone",
      });
    }

    const result = await otpService.generateAndSendOTP(
      normalizedPhone,
      purpose,
      email || null,
    );
    return successResponse(res, 200, result.message, {
      expiresIn: result.expiresIn,
      identifierType: result.identifierType,
    });
  } catch (error) {
    logger.error(`Error sending OTP: ${error.message}`);
    return errorResponse(res, 500, error.message);
  }
});

/**
 * Verify OTP and login/register
 * POST /api/auth/verify-otp
 */
export const verifyOTP = asyncHandler(async (req, res) => {
  let {
    phone,
    email,
    otp,
    purpose = "login",
    name,
    role: userRole = "user",
    password,
  } = req.body;

  // Validate inputs
  if ((!phone && !email) || !otp) {
    return errorResponse(
      res,
      400,
      "Either phone number or email, and OTP are required",
    );
  }

  // Normalize phone number if provided
  if (phone) {
    phone = normalizePhoneNumber(phone);
  }

  const identifier = phone || email;
  const identifierType = phone ? "phone" : "email";

  // Validate role - admin can be used for admin signup/reset
  const allowedRoles = ["user", "restaurant", "delivery", "admin"];
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // For email-based admin registration, password is mandatory
  if (purpose === "register" && !phone && userRole === "admin" && !password) {
    return errorResponse(
      res,
      400,
      "Password is required for admin email registration",
    );
  }

  try {
    let user;
    const identifier = phone || email;
    const identifierType = phone ? "phone" : "email";

    if (purpose === "register") {
      // Registration flow
      // Check if user already exists with same email/phone AND role
      const findQuery = phone
        ? buildPhoneQuery(phone, userRole)
        : { email, role: userRole };
      user = await User.findOne(findQuery);

      if (user) {
        return errorResponse(
          res,
          400,
          `User already exists with this ${identifierType} and role. Please login.`,
        );
      }

      // Name is mandatory for explicit registration
      if (!name) {
        return errorResponse(res, 400, "Name is required for registration");
      }

      // Verify OTP (phone or email) before creating user
      // Default OTP for specific number (Requested by USER)
      if ((phone === "917610416911" || phone === "919009925021") && otp === "123456") {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(phone || null, otp, purpose, email || null);
      }

      const { fcmToken, platform = 'web' } = req.body;
      const userData = {
        name,
        role: userRole,
        signupMethod: phone ? "phone" : "email",
        platform: platform || 'web'
      };

      // Set correct field based on platform
      if (fcmToken) {
        if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
          userData.fcmTokenMobile = fcmToken;
        } else {
          userData.fcmToken = fcmToken;
        }
      }

      // Handle referral code
      const { referralCode } = req.body;
      if (referralCode && userRole === 'user') {
        const referrer = await User.findOne({ referralCode, role: 'user' });
        if (referrer) {
          userData.referredBy = referrer._id;
        }
      }

      if (phone) {
        userData.phone = phone;
        userData.phoneVerified = true;
      }
      if (email) {
        userData.email = email;
        // Note: We could add emailVerified field if needed
      }

      // If password provided (email/password registration like admin signup), set it
      if (password && !phone) {
        userData.password = password;
      }

      try {
        user = await User.create(userData);

        // Finalize referral tracking
        if (user.referredBy) {
          await User.findByIdAndUpdate(user.referredBy, {
            $inc: { 'referralStats.invited': 1, 'referralStats.pending': 1 }
          });

          const settings = await BusinessSettings.getSettings();
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + (settings?.referral?.expiryDays || 30));

          await ReferralLog.create({
            referrer: user.referredBy,
            referee: user._id,
            status: 'pending',
            expiryDate
          });
        }
      } catch (createError) {
        // Handle duplicate key error - user might have been created between findOne and create
        if (createError.code === 11000) {
          // Try to find the user again
          const findQuery = phone
            ? { phone, role: userRole }
            : { email, role: userRole };
          user = await User.findOne(findQuery);
          if (!user) {
            throw createError; // Re-throw if still not found
          }
          // User exists, return error that they should login instead
          return errorResponse(
            res,
            400,
            `User already exists with this ${identifierType} and role. Please login.`,
          );
        } else {
          throw createError;
        }
      }

      logger.info(`New user registered: ${user._id}`, {
        [identifierType]: identifier,
        userId: user._id,
        role: userRole,
      });
    } else {
      // Login (with optional auto-registration)
      // Find user by email/phone AND role to ensure correct module access
      const findQuery = phone
        ? buildPhoneQuery(phone, userRole)
        : { email, role: userRole };

      user = await User.findOne(findQuery);

      if (!user && !name) {
        // OTP has NOT been verified yet in this flow.
        // Tell the client that we need user's name to proceed with auto-registration.
        // The client should collect name and call this endpoint again with the same OTP and name.
        return successResponse(
          res,
          200,
          "User not found. Please provide name for registration.",
          {
            needsName: true,
            identifierType,
            identifier,
          },
        );
      }

      // Handle reset-password purpose
      if (purpose === "reset-password") {
        if (!user) {
          return errorResponse(
            res,
            404,
            `No ${userRole} account found with this email.`,
          );
        }
        // Verify OTP for password reset
        // Default OTP for specific number (Requested by USER)
        if ((phone === "917610416911" || phone === "919009925021") && otp === "123456") {
          // Skip verification for default OTP
        } else {
          await otpService.verifyOTP(phone || null, otp, purpose, email || null);
        }
        // Return success - frontend will call reset-password endpoint with OTP
        return successResponse(
          res,
          200,
          "OTP verified. You can now reset your password.",
          {
            verified: true,
            email: user.email,
          },
        );
      }

      // In both cases we must verify OTP first.
      // Default OTP for specific number (Requested by USER)
      if ((phone === "917610416911" || phone === "919009925021") && otp === "123456") {
        // Skip verification for default OTP
      } else {
        await otpService.verifyOTP(phone || null, otp, purpose, email || null);
      }

      const { fcmToken, platform = 'web' } = req.body;

      if (!user) {
        // Auto-register new user after OTP verification
        const userData = {
          name,
          role: userRole,
          signupMethod: phone ? "phone" : "email",
          platform: platform || 'web'
        };

        // Set correct field based on platform
        if (fcmToken) {
          if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
            userData.fcmTokenMobile = fcmToken;
          } else {
            userData.fcmToken = fcmToken;
          }
        }

        // Handle referral code for auto-registration
        const { referralCode } = req.body;
        if (referralCode && userRole === 'user') {
          const referrer = await User.findOne({ referralCode, role: 'user' });
          if (referrer) {
            userData.referredBy = referrer._id;
          }
        }

        if (phone) {
          userData.phone = phone;
          userData.phoneVerified = true;
        }
        // Only include email if provided (don't set to null)
        if (email) {
          userData.email = email;
        }

        if (password && !phone) {
          userData.password = password;
        }

        try {
          user = await User.create(userData);

          // Finalize referral tracking for auto-registration
          if (user.referredBy) {
            await User.findByIdAndUpdate(user.referredBy, {
              $inc: { 'referralStats.invited': 1, 'referralStats.pending': 1 }
            });

            const settings = await BusinessSettings.getSettings();
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + (settings?.referral?.expiryDays || 30));

            await ReferralLog.create({
              referrer: user.referredBy,
              referee: user._id,
              status: 'pending',
              expiryDate
            });
          }
        } catch (createError) {
          // Handle duplicate key error - user might have been created between findOne and create
          if (createError.code === 11000) {
            // Try to find the user again
            const findQuery = phone
              ? { phone, role: userRole }
              : { email, role: userRole };
            user = await User.findOne(findQuery);
            if (!user) {
              throw createError; // Re-throw if still not found
            }
            // User exists, continue with login flow
            logger.info(`User found after duplicate key error: ${user._id}`);
          } else {
            throw createError;
          }
        }

        logger.info(`New user auto-registered: ${user._id}`, {
          [identifierType]: identifier,
          userId: user._id,
          role: userRole,
        });
      } else {
        // Existing user login - update verification status if needed
        if (phone && !user.phoneVerified) {
          user.phoneVerified = true;
        }

        // Update FCM Token and platform on login
        if (fcmToken) {
          user.platform = platform || user.platform || 'web';

          if (['android', 'ios', 'app'].includes(user.platform?.toLowerCase())) {
            user.fcmTokenMobile = fcmToken;
          } else {
            user.fcmToken = fcmToken;
          }

          logger.info(`FCM Token updated for user login: ${user._id}`, {
            fcmToken,
            platform: user.platform
          });
          console.log(`[PUSH-NOTIFICATION] FCM Token stored for user ${user._id}: ${fcmToken} (${user.platform})`);
        }
        await user.save();
        // Could add email verification status update here if needed
      }
    }

    // Generate tokens
    const tokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      phone: user.phone,
    });

    // Set refresh token in httpOnly cookie
    // Set refresh token in httpOnly cookie - using role-specific name to avoid collisions
    const cookieName = userRole === 'admin' ? 'admin_refreshToken' : 'user_refreshToken';
    res.cookie(
      cookieName,
      tokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
      }),
    );

    // Return access token and user info
    return successResponse(res, 200, "Authentication successful", {
      accessToken: tokens.accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        role: user.role,
        profileImage: user.profileImage,
        signupMethod: user.signupMethod,
      },
    });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    return errorResponse(res, 400, error.message);
  }
});

/**
 * Refresh Access Token
 * POST /api/auth/refresh-token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  // User auth refresh endpoint should only use user refresh cookies.
  // This avoids cross-module cookie mix-ups (admin/restaurant/delivery)
  // causing unintended auto-logout in parallel sessions.
  const refreshToken =
    req.cookies?.user_refreshToken ||
    req.cookies?.refreshToken;

  if (!refreshToken) {
    return errorResponse(res, 401, "Refresh token not found");
  }

  try {
    // Verify refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);

    if (decoded?.role !== "user") {
      return errorResponse(res, 401, "Invalid token for user");
    }

    // Get user
    const user = await User.findById(decoded.userId).select("-password");

    if (!user || !user.isActive) {
      return errorResponse(res, 401, "User not found or inactive");
    }

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
      phone: user.phone,
    });

    return successResponse(res, 200, "Token refreshed successfully", {
      accessToken,
    });
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid refresh token");
  }
});

/**
 * Logout
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Clear all potential refresh token cookies
  const cookieOptions = getRefreshCookieOptions();

  res.clearCookie("user_refreshToken", cookieOptions);
  res.clearCookie("admin_refreshToken", cookieOptions);
  res.clearCookie("delivery_refreshToken", cookieOptions);
  res.clearCookie("restaurant_refreshToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);

  return successResponse(res, 200, "Logged out successfully");
});

/**
 * Register with email and password
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role = "user" } = req.body;

  if (!name || !email || !password) {
    return errorResponse(res, 400, "Name, email, and password are required");
  }

  // Validate role - admin can be registered via email OTP
  const allowedRoles = ["user", "restaurant", "delivery", "admin"];
  const userRole = role || "user";
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Check if user already exists with same email/phone AND role
  // Allow same email/phone for different roles
  const findQuery = {};
  if (email) findQuery.email = email;
  if (phone) findQuery.phone = phone;
  findQuery.role = userRole;

  const existingUser = await User.findOne(findQuery);

  if (existingUser) {
    if (existingUser.email === email) {
      return errorResponse(
        res,
        400,
        `User with this email and role (${userRole}) already exists. Please login.`,
      );
    }
    if (existingUser.phone === phone) {
      return errorResponse(
        res,
        400,
        `User with this phone number and role (${userRole}) already exists. Please login.`,
      );
    }
  }

  // Handle referral code
  const { referralCode } = req.body;
  let referredBy = null;
  if (referralCode && userRole === 'user') {
    const referrer = await User.findOne({ referralCode, role: 'user' });
    if (referrer) {
      referredBy = referrer._id;
    }
  }

  const { fcmToken, platform = 'web' } = req.body;

  // Create new user
  const user = await User.create({
    name,
    email,
    password, // Will be hashed by pre-save hook
    phone: phone || null,
    role: userRole,
    signupMethod: "email", // Email/password registration
    referredBy,
    fcmToken: fcmToken || null,
    platform: platform || 'web'
  });

  if (fcmToken) {
    logger.info(`[PUSH-NOTIFICATION] FCM Token stored for new user registration ${user._id}: ${fcmToken} (${user.platform})`);
    console.log(`[PUSH-NOTIFICATION] FCM Token stored for new user registration ${user._id}: ${fcmToken} (${user.platform})`);
  }

  // Finalize referral tracking
  if (user.referredBy) {
    await User.findByIdAndUpdate(user.referredBy, {
      $inc: { 'referralStats.invited': 1, 'referralStats.pending': 1 }
    });

    const settings = await BusinessSettings.getSettings();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (settings?.referral?.expiryDays || 30));

    await ReferralLog.create({
      referrer: user.referredBy,
      referee: user._id,
      status: 'pending',
      expiryDate
    }); 
  }

  // Generate tokens
  const tokens = jwtService.generateTokens({
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  // Set refresh token in httpOnly cookie
  const cookieName = userRole === 'admin' ? 'admin_refreshToken' : 'user_refreshToken';
  res.cookie(
    cookieName,
    tokens.refreshToken,
    getRefreshCookieOptions({
      maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    }),
  );

  logger.info(`New user registered via email: ${user._id}`, {
    email,
    userId: user._id,
    role: userRole,
  });

  // Send welcome email
  if (user.email) {
    // Import emailService dynamically to avoid circular dependencies if any
    const emailService = (await import("../services/emailService.js")).default;
    emailService.sendWelcomeEmail(user.email, user.name).catch((err) => {
      logger.error(`Failed to send welcome email: ${err.message}`);
    });
  }

  return successResponse(res, 201, "Registration successful", {
    accessToken: tokens.accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
    },
  });
});

/**
 * Login with email and password
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return errorResponse(res, 400, "Email and password are required");
  }

  // Find user by email and role (if role provided) to ensure correct module access
  // If role not provided, find by email only (backward compatibility)
  const findQuery = { email };
  if (role) {
    findQuery.role = role;
  }

  const user = await User.findOne(findQuery).select("+password");

  if (!user) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  // If role was provided but doesn't match, return error
  if (role && user.role !== role) {
    return errorResponse(
      res,
      401,
      `No ${role} account found with this email. Please check your credentials.`,
    );
  }

  if (!user.isActive) {
    return errorResponse(
      res,
      401,
      "Account is inactive. Please contact support.",
    );
  }

  // Check if user has a password set
  if (!user.password) {
    return errorResponse(
      res,
      400,
      "Account was created with phone. Please use OTP login.",
    );
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    return errorResponse(res, 401, "Invalid email or password");
  }

  // Update FCM Token and platform on login
  const { fcmToken, platform = 'web' } = req.body;
  if (fcmToken) {
    user.fcmToken = fcmToken;
    user.platform = platform || user.platform || 'web';
    await user.save();
    logger.info(`[PUSH-NOTIFICATION] FCM Token stored for user login ${user._id}: ${fcmToken} (${user.platform})`);
    console.log(`[PUSH-NOTIFICATION] FCM Token stored for user login ${user._id}: ${fcmToken} (${user.platform})`);
  }

  // Generate tokens
  const tokens = jwtService.generateTokens({
    userId: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  // Set role-specific refresh token cookie
  const cookieName =
    user.role === "admin"
      ? "admin_refreshToken"
      : user.role === "restaurant"
        ? "restaurant_refreshToken"
        : user.role === "delivery"
          ? "delivery_refreshToken"
          : "user_refreshToken";
  res.cookie(
    cookieName,
    tokens.refreshToken,
    getRefreshCookieOptions({
      maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    }),
  );

  logger.info(`User logged in via email: ${user._id}`, {
    email,
    userId: user._id,
  });

  return successResponse(res, 200, "Login successful", {
    accessToken: tokens.accessToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
    },
  });
});

/**
 * Reset Password with OTP verification
 * POST /api/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword, role } = req.body;

  if (!email || !otp || !newPassword) {
    return errorResponse(res, 400, "Email, OTP, and new password are required");
  }

  if (newPassword.length < 6) {
    return errorResponse(
      res,
      400,
      "Password must be at least 6 characters long",
    );
  }

  // Find user by email and role (if role provided) to ensure correct module access
  const findQuery = { email };
  if (role) {
    findQuery.role = role;
  }

  const user = await User.findOne(findQuery).select("+password");

  if (!user) {
    return errorResponse(
      res,
      404,
      role ? `No ${role} account found with this email.` : "User not found",
    );
  }

  // If role was provided but doesn't match, return error
  if (role && user.role !== role) {
    return errorResponse(res, 404, `No ${role} account found with this email.`);
  }

  // Verify OTP for reset-password purpose
  try {
    await otpService.verifyOTP(null, otp, "reset-password", email);
  } catch (error) {
    logger.error(
      `OTP verification failed for password reset: ${error.message}`,
    );
    return errorResponse(
      res,
      400,
      "Invalid or expired OTP. Please request a new one.",
    );
  }

  // Update password
  user.password = newPassword; // Will be hashed by pre-save hook
  await user.save();

  logger.info(`Password reset successful for user: ${user._id}`, {
    email,
    userId: user._id,
  });

  return successResponse(
    res,
    200,
    "Password reset successfully. Please login with your new password.",
  );
});

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  // User is attached by authenticate middleware
  return successResponse(res, 200, "User retrieved successfully", {
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      phoneVerified: req.user.phoneVerified,
      role: req.user.role,
      profileImage: req.user.profileImage,
      signupMethod: req.user.signupMethod,
      preferences: req.user.preferences,
      wallet: req.user.wallet,
      // Include additional profile fields
      dateOfBirth: req.user.dateOfBirth,
      anniversary: req.user.anniversary,
      gender: req.user.gender,
    },
  });
});

/**
 * Login / register using Firebase Google ID token
 * POST /api/auth/firebase/google-login
 */
export const firebaseGoogleLogin = asyncHandler(async (req, res) => {
  const { idToken, role = "restaurant" } = req.body;

  if (!idToken) {
    return errorResponse(res, 400, "Firebase ID token is required");
  }

  // Validate role - admin cannot be authenticated through this endpoint
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";
  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  try {
    // Verify Firebase ID token - this will now auto-initialize if needed
    const decoded = await firebaseAuthService.verifyIdToken(idToken);

    const firebaseUid = decoded.uid;
    const email = decoded.email || null;
    const name = decoded.name || decoded.display_name || "Google User";
    const picture = decoded.picture || decoded.photo_url || null;
    const emailVerified = !!decoded.email_verified;

    // Validate email is present
    if (!email) {
      logger.error("Firebase Google login failed: Email not found in token", {
        uid: firebaseUid,
      });
      return errorResponse(
        res,
        400,
        "Email not found in Firebase user. Please ensure email is available in your Google account.",
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.error("Firebase Google login failed: Invalid email format", {
        email,
      });
      return errorResponse(
        res,
        400,
        "Invalid email format received from Google.",
      );
    }

    // Find existing user by firebase UID (stored in googleId) or email with same role
    let user = await User.findOne({
      $or: [{ googleId: firebaseUid }, { email, role: userRole }],
    });

    if (user) {
      // If user exists but googleId not linked yet, link it
      if (!user.googleId) {
        user.googleId = firebaseUid;
        user.googleEmail = email;
        if (!user.profileImage && picture) {
          user.profileImage = picture;
        }
        // Update signupMethod if not already set
        if (!user.signupMethod) {
          user.signupMethod = "google";
        }
        await user.save();
        logger.info("Linked Google account to existing user", {
          userId: user._id,
          email,
        });
      }

      // FCM Token Update
      const { fcmToken, platform = 'web' } = req.body;
      if (fcmToken) {
        user.platform = platform || user.platform || 'web';

        if (['android', 'ios', 'app'].includes(user.platform?.toLowerCase())) {
          user.fcmTokenMobile = fcmToken;
        } else {
          user.fcmToken = fcmToken;
        }

        await user.save();
        logger.info(`[PUSH-NOTIFICATION] FCM Token stored for user google-login ${user._id}: ${fcmToken} (${user.platform})`);
        console.log(`[PUSH-NOTIFICATION] FCM Token stored for user google-login ${user._id}: ${fcmToken} (${user.platform})`);
      }

      // Role checks
      if (userRole === "restaurant" && user.role !== "restaurant") {
        return errorResponse(
          res,
          403,
          "This account is not registered as a restaurant partner",
        );
      }

      if (user.role !== userRole) {
        return errorResponse(
          res,
          403,
          `This account is registered as ${user.role}, not ${userRole}`,
        );
      }

      logger.info("Existing user logged in via Firebase Google", {
        userId: user._id,
        email,
        role: user.role,
      });
    } else {
      // Auto-register new user based on Firebase data
      const { referralCode } = req.body;
      let referredBy = null;
      if (referralCode && userRole === 'user') {
        const referrer = await User.findOne({ referralCode, role: 'user' });
        if (referrer) {
          referredBy = referrer._id;
        }
      }

      const { fcmToken, platform = 'web' } = req.body;
      const userData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        googleId: firebaseUid,
        googleEmail: email.toLowerCase().trim(),
        role: userRole,
        signupMethod: "google",
        profileImage: picture || null,
        isActive: true,
        referredBy,
        platform: platform || 'web'
      };

      if (fcmToken) {
        if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
          userData.fcmTokenMobile = fcmToken;
        } else {
          userData.fcmToken = fcmToken;
        }
      }

      if (req.body.fcmToken) {
        logger.info(`[PUSH-NOTIFICATION] FCM Token stored for user google-registration: ${req.body.fcmToken}`);
        console.log(`[PUSH-NOTIFICATION] FCM Token stored for user google-registration: ${req.body.fcmToken}`);
      }

      try {
        user = await User.create(userData);

        // Finalize referral tracking
        if (user.referredBy) {
          await User.findByIdAndUpdate(user.referredBy, {
            $inc: { 'referralStats.invited': 1, 'referralStats.pending': 1 }
          });

          const { default: BusinessSettings } = await import('../../admin/models/BusinessSettings.js');
          const settings = await BusinessSettings.getSettings();

          const { default: ReferralLog } = await import('../../admin/models/ReferralLog.js');
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + (settings?.referral?.expiryDays || 30));

          await ReferralLog.create({
            referrer: user.referredBy,
            referee: user._id,
            status: 'pending',
            expiryDate
          });
        }

        logger.info("New user registered via Firebase Google login", {
          firebaseUid,
          email,
          userId: user._id,
          role: userRole,
          name: user.name,
        });
      } catch (createError) {
        if (createError.code === 11000) {
          user = await User.findOne({ email, role: userRole });
          if (!user) throw createError;

          if (!user.googleId) {
            user.googleId = firebaseUid;
            user.googleEmail = email;
            if (!user.profileImage && picture) user.profileImage = picture;
            if (!user.signupMethod) user.signupMethod = "google";
            await user.save();
          }
        } else {
          throw createError;
        }
      }
    }

    // Final common steps
    if (!user.isActive) {
      user.isActive = true;
      await user.save();
      logger.info('Auto-activated account', { userId: user._id });
    }

    const tokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });

    const cookieName =
      user.role === "admin"
        ? "admin_refreshToken"
        : user.role === "restaurant"
          ? "restaurant_refreshToken"
          : user.role === "delivery"
            ? "delivery_refreshToken"
            : "user_refreshToken";
    res.cookie(
      cookieName,
      tokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
      }),
    );

    return successResponse(res, 200, "Authentication successful", {
      accessToken: tokens.accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        phoneVerified: user.phoneVerified,
        role: user.role,
        profileImage: user.profileImage,
        signupMethod: user.signupMethod,
      },
    });
  } catch (error) {
    logger.error(`Error in Firebase Google login: ${error.message}`);
    return errorResponse(res, 400, error.message || "Authentication failed");
  }
});

/**
 * Initiate Google OAuth flow
 * GET /api/auth/google/:role
 */
export const googleAuth = asyncHandler(async (req, res) => {
  const { role } = req.params;

  // Validate role
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";

  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Check if Google OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return errorResponse(
      res,
      500,
      "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env",
    );
  }

  try {
    const { authUrl, state } = googleAuthService.getAuthUrl(userRole);

    // Store state in session/cookie for verification (optional, for extra security)
    res.cookie("oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    // Redirect to Google OAuth
    return res.redirect(authUrl);
  } catch (error) {
    logger.error(`Error initiating Google OAuth: ${error.message}`);
    return errorResponse(res, 500, "Failed to initiate Google OAuth");
  }
});

/**
 * Handle Google OAuth callback
 * GET /api/auth/google/:role/callback
 */
export const googleCallback = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { code, state, error } = req.query;

  // Validate role
  const allowedRoles = ["user", "restaurant", "delivery"];
  const userRole = role || "restaurant";

  if (!allowedRoles.includes(userRole)) {
    return errorResponse(
      res,
      400,
      `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
    );
  }

  // Check for OAuth errors
  if (error) {
    logger.error(`Google OAuth error: ${error}`);
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=oauth_failed`,
    );
  }

  if (!code) {
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=no_code`,
    );
  }

  // Verify state (optional but recommended)
  const storedState = req.cookies?.oauth_state;
  if (storedState && state !== storedState) {
    logger.warn("OAuth state mismatch - possible CSRF attack");
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=invalid_state`,
    );
  }

  try {
    // Exchange code for tokens
    const tokens = await googleAuthService.getTokens(code);

    // Get user info from Google
    const googleUser = await googleAuthService.getUserInfoFromToken(tokens);

    if (!googleUser.email) {
      return res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=no_email`,
      );
    }

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
    });

    if (user) {
      // Update Google info if not set
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
        user.googleEmail = googleUser.email;
        if (!user.profileImage && googleUser.picture) {
          user.profileImage = googleUser.picture;
        }
        // Update signupMethod if not already set
        if (!user.signupMethod) {
          user.signupMethod = "google";
        }
        await user.save();
      }

      // Ensure role matches (for restaurant login, user should be restaurant)
      if (userRole === "restaurant" && user.role !== "restaurant") {
        return res.redirect(
          `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=wrong_role`,
        );
      }
    } else {
      // Create new user
      const userData = {
        name: googleUser.name || "Google User",
        email: googleUser.email,
        googleId: googleUser.googleId,
        googleEmail: googleUser.email,
        role: userRole,
        signupMethod: "google",
        profileImage: googleUser.picture || null,
      };

      user = await User.create(userData);
      logger.info(`New user registered via Google: ${user._id}`, {
        email: googleUser.email,
        userId: user._id,
        role: userRole,
      });
    }

    // Generate JWT tokens
    const jwtTokens = jwtService.generateTokens({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    });

    // Set refresh token in httpOnly cookie - using role-specific name to avoid collisions
    const cookieName = userRole === 'admin' ? 'admin_refreshToken' :
      userRole === 'restaurant' ? 'restaurant_refreshToken' :
        userRole === 'delivery' ? 'delivery_refreshToken' : 'user_refreshToken';
    res.cookie(
      cookieName,
      jwtTokens.refreshToken,
      getRefreshCookieOptions({
        maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
      }),
    );

    // Clear OAuth state cookie
    res.clearCookie("oauth_state");

    // Redirect to frontend with access token as query param
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectPath =
      userRole === "restaurant"
        ? "/restaurant/auth/google-callback"
        : userRole === "delivery"
          ? "/delivery/auth/google-callback"
          : "/user/auth/google-callback";

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      profileImage: user.profileImage,
      signupMethod: user.signupMethod,
    };

    const redirectUrl = `${frontendUrl}${redirectPath}?token=${jwtTokens.accessToken}&user=${encodeURIComponent(JSON.stringify(userData))}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error(`Error in Google OAuth callback: ${error.message}`);
    return res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:5173"}/restaurant/login?error=auth_failed`,
    );
  }
});

/**
 * Update FCM Token for already-logged-in user
 * PUT /api/auth/update-fcm-token
 */
export const updateFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken, platform = 'web' } = req.body;

  if (!fcmToken) {
    return errorResponse(res, 400, 'FCM token is required');
  }

  // Use the user model instance already attached by the universal authenticate middleware
  const user = req.user;

  if (!user) {
    return errorResponse(res, 404, 'User not found or not authenticated');
  }

  // Update FCM token and platform
  user.platform = platform;
  if (['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
    user.fcmTokenMobile = fcmToken;
  } else {
    user.fcmToken = fcmToken;
  }

  // Handle restaurant status specifically if they are updating token from the app
  if (user.role === 'restaurant' && ['android', 'ios', 'app'].includes(platform?.toLowerCase())) {
    console.log(`[PUSH-NOTIFICATION] Restaurant ${user._id} updated FCM token from app`);
  }

  await user.save();
  console.log(`[PUSH-NOTIFICATION] FCM Token refreshed for ${user.role || 'user'} ${user._id}: ${fcmToken} (${platform})`);

  return successResponse(res, 200, 'FCM token updated successfully');
});
