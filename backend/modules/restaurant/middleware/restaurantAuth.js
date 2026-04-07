import jwtService from '../../auth/services/jwtService.js';
import Restaurant from '../models/Restaurant.js';
import StaffManagement from '../models/StaffManagement.js';
import { errorResponse } from '../../../shared/utils/response.js';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Restaurant Authentication Middleware
 * Verifies JWT access token and attaches restaurant to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 401, 'No token provided');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwtService.verifyAccessToken(token);

    // Ensure it's a restaurant token
    if (decoded.role !== 'restaurant') {
      return errorResponse(res, 403, 'Invalid token. Restaurant access required.');
    }

    // Get restaurant from database
    let restaurant = await Restaurant.findById(decoded.userId).select('-password');
    let staffRecord = null;

    if (!restaurant) {
      // If not a restaurant owner, check if it's a staff member
      staffRecord = await StaffManagement.findOne({
        _id: decoded.userId,
        status: 'active'
      });

      if (staffRecord) {
        // Resolve the restaurant the staff member belongs to
        restaurant = await Restaurant.findById(staffRecord.restaurantId).select('-password');
        if (restaurant) {
          // Verify the restaurant is still active/valid
          if (!restaurant.isActive && !restaurant.approvedAt) {
             // Inactive restaurant - but we continue because the middleware has special logic for onboarding routes below
          }
        }
      }
    }
    
    if (!restaurant) {
      console.error('❌ User/Restaurant not found in database:', {
        userId: decoded.userId,
        role: decoded.role,
        email: decoded.email,
        isStaff: !!staffRecord
      });
      return errorResponse(res, 401, staffRecord ? 'Associated restaurant not found' : 'User not found');
    }

    // Capture staff info if applicable
    if (staffRecord) {
      req.staff = staffRecord;
    }

    // Allow inactive/unapproved restaurants to access onboarding and profile routes
    // They need to complete onboarding even if not yet approved by admin.
    // Only block inactive/unapproved restaurants from accessing other restricted routes.
    const requestPath = req.originalUrl || req.url || '';
    const reqPath = req.path || '';
    const baseUrl = req.baseUrl || '';
    
    // Check for onboarding routes (can be /onboarding or /api/restaurant/onboarding)
    const isOnboardingRoute = requestPath.includes('/onboarding') || reqPath === '/onboarding' || reqPath.includes('onboarding');
    
    // Check for profile/auth routes
    // Note: /auth/me and /auth/reverify are handled by restaurantAuthRoutes mounted at /auth, so:
    // - Full path: /api/restaurant/auth/me or /api/restaurant/auth/reverify
    // - reqPath: /me or /reverify (relative to /auth mount point)
    // - baseUrl: /auth (if mounted)
    // /owner/me is directly under /api/restaurant, so reqPath would be /owner/me
    const isProfileRoute = requestPath.includes('/auth/me') || requestPath.includes('/auth/reverify') || 
                          requestPath.includes('/owner/me') || 
                          requestPath.includes('/profile') ||
                          requestPath.includes('/fcm-token') ||
                          requestPath.includes('fcm-token') ||
                          reqPath === '/me' || reqPath === '/reverify' || reqPath === '/owner/me' ||
                          reqPath.includes('profile') ||
                          (baseUrl.includes('/auth') && (reqPath === '/me' || reqPath === '/reverify'));
    
    // Check for menu routes - restaurants need to access menu even when inactive
    // They might need to set up menu during onboarding or after approval
    // Routes: /api/restaurant/menu, /api/restaurant/menu/section, /api/restaurant/menu/item/schedule, etc.
    const isMenuRoute = requestPath.includes('/menu') || 
                       reqPath === '/menu' || 
                       reqPath.startsWith('/menu/') ||
                       baseUrl.includes('/menu');
    
    // Check for inventory routes - restaurants need to manage inventory even when inactive
    // Routes: /api/restaurant/inventory
    const isInventoryRoute = requestPath.includes('/inventory') || 
                            reqPath === '/inventory' ||
                            reqPath.startsWith('/inventory/');
    
    const isApproved = !!restaurant.approvedAt;

    // Debug logging for inactive/unapproved restaurants
    if (!restaurant.isActive || !isApproved) {
      if (isDev) {
        console.log('🔍 Inactive restaurant route check:', {
          restaurantId: restaurant._id,
          restaurantName: restaurant.name,
          isActive: restaurant.isActive,
          isApproved,
          requestPath,
          reqPath,
          baseUrl,
          originalUrl: req.originalUrl,
          url: req.url,
          isOnboardingRoute,
          isProfileRoute,
          isMenuRoute,
          isInventoryRoute,
          willAllow: isOnboardingRoute || isProfileRoute || isMenuRoute || isInventoryRoute
        });
      }
    }
    
    // Allow access to onboarding, profile, menu, and inventory routes even if inactive/unapproved.
    // These are essential for restaurant setup and management.
    // Also allow access to getCurrentRestaurant endpoint (used to check status).
    const isOperationalRoute = !isOnboardingRoute && !isProfileRoute && !isMenuRoute && !isInventoryRoute;

    // Block all other routes for restaurants that are either inactive or not yet approved.
    if ((!restaurant.isActive || !isApproved) && isOperationalRoute) {
      console.error('❌ Restaurant account is inactive or not approved - access denied:', {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        isActive: restaurant.isActive,
        isApproved,
        requestPath,
        reqPath,
        baseUrl,
        originalUrl: req.originalUrl,
        url: req.url,
        routeChecks: {
          isOnboardingRoute,
          isProfileRoute,
          isMenuRoute,
          isInventoryRoute
        }
      });
      return errorResponse(res, 401, 'Restaurant account is inactive. Please wait for admin approval.');
    }

    // Attach restaurant to request
    req.restaurant = restaurant;
    req.token = decoded;
    
    next();
  } catch (error) {
    return errorResponse(res, 401, error.message || 'Invalid token');
  }
};

export default { authenticate };
