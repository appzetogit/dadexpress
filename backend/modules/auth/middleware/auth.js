import jwtService from "../services/jwtService.js";
import User from "../models/User.js";
import { errorResponse } from "../../../shared/utils/response.js";

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, 401, "No token provided");
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Get correct model based on role
    let user = null;
    const { userId, role } = decoded;

    if (role === 'delivery') {
      const { default: Delivery } = await import("../../delivery/models/Delivery.js");
      user = await Delivery.findById(userId).select("-password -refreshToken");
    } else if (role === 'restaurant') {
      const { default: Restaurant } = await import("../../restaurant/models/Restaurant.js");
      user = await Restaurant.findById(userId).select("-password");
    } else if (role === 'admin') {
      const { default: Admin } = await import("../../admin/models/Admin.js");
      user = await Admin.findById(userId).select("-password");
    } else {
      // Default to User model for 'user' role or if role is missing (backward compatibility)
      user = await User.findById(userId).select("-password");
    }

    if (!user) {
      return errorResponse(res, 401, "User not found");
    }

    if (!user.isActive) {
      return errorResponse(res, 401, "User account is inactive");
    }

    // Attach user to request
    req.user = user;
    req.token = decoded;

    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || "Invalid token");
  }
};

/**
 * Role-based Authorization Middleware
 * @param {...string} roles - Allowed roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        403,
        "Access denied. Insufficient permissions.",
      );
    }

    next();
  };
};

export default { authenticate, authorize };
