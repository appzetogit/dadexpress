/**
 * JWT Token Utilities
 * Decode and extract information from JWT tokens
 */

const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
};

const safeSessionStorage = {
  removeItem(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Decode JWT token without verification (client-side only)
 * @param {string} token - JWT token
 * @returns {Object|null} - Decoded token payload or null if invalid
 */
export function decodeToken(token) {
  if (!token) return null;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url encoded payload
    const payload = parts[1];
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add missing padding
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Properly decode UTF-8 characters instead of just using atob directly
    // atob alone will fail on non-ASCII characters (e.g., emojis, international chars)
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    
    const decoded = JSON.parse(jsonPayload);
    
    return decoded;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Get user role from token
 * @param {string} token - JWT token
 * @returns {string|null} - User role or null if not found
 */
export function getRoleFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.role || null;
}

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} - True if expired or invalid
 */
export function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  // exp is in seconds, Date.now() is in milliseconds
  return decoded.exp * 1000 < Date.now();
}

/**
 * Get user ID from token
 * @param {string} token - JWT token
 * @returns {string|null} - User ID or null if not found
 */
export function getUserIdFromToken(token) {
  const decoded = decodeToken(token);
  return decoded?.userId || decoded?.id || null;
}

/**
 * Check if user has access to a module based on role
 * @param {string} role - User role
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if user has access
 */
export function hasModuleAccess(role, module) {
  const roleModuleMap = {
    'admin': 'admin',
    'restaurant': 'restaurant',
    'delivery': 'delivery',
    'user': 'user'
  };

  return roleModuleMap[role] === module;
}

/**
 * Get module-specific access token
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Access token or null
 */
export function getModuleToken(module) {
  return safeStorage.getItem(`${module}_accessToken`);
}

/**
 * Get current user's role from a specific module's token
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {string|null} - Current user role or null
 */
export function getCurrentUserRole(module = null) {
  // If module is specified, check that module's token
  if (module) {
    const token = getModuleToken(module);
    if (!token) return null;
    
    // Allow the axios interceptor to handle expired tokens via refresh
    // We still return the role from the expired token so UI doesn't flicker
    // before the interceptor kicks in.
    return getRoleFromToken(token);
  }
  
  // Legacy: check all modules and return the first valid role found
  // This is for backward compatibility but should be avoided
  const modules = ['user', 'restaurant', 'delivery', 'admin'];
  for (const mod of modules) {
    const token = getModuleToken(mod);
    if (token) {
      return getRoleFromToken(token);
    }
  }
  
  return null;
}

/**
 * Check if user is authenticated for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @returns {boolean} - True if authenticated
 */
export function isModuleAuthenticated(module) {
  const token = getModuleToken(module);
  if (!token) return false;
  
  // We don't check isTokenExpired here because we want the Axios
  // interceptor to attempt a refresh if the token is expired.
  // The backend and interceptor will handle actual authentication state.
  return true;
}

/**
 * Clear authentication data for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 */
export function clearModuleAuth(module) {
  safeStorage.removeItem(`${module}_accessToken`);
  safeStorage.removeItem(`${module}_authenticated`);
  safeStorage.removeItem(`${module}_user`);
  // Also clear any sessionStorage data
  safeSessionStorage.removeItem(`${module}AuthData`);
}

/**
 * Clear all authentication data for all modules
 */
export function clearAuthData() {
  const modules = ['admin', 'restaurant', 'delivery', 'user'];
  modules.forEach(module => {
    clearModuleAuth(module);
  });
  // Also clear legacy token if it exists
  safeStorage.removeItem('accessToken');
  safeStorage.removeItem('user');
}

/**
 * Set authentication data for a specific module
 * @param {string} module - Module name (admin, restaurant, delivery, user)
 * @param {string} token - Access token
 * @param {Object} user - User data
 * @throws {Error} If localStorage is not available or quota exceeded
 */
export function setAuthData(module, token, user) {
  try {
    // Check if localStorage is available
    if (typeof Storage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    // Validate inputs
    if (!module || !token) {
      throw new Error(`Invalid parameters: module=${module}, token=${!!token}`);
    }

    console.log(`[setAuthData] Storing auth for module: ${module}`, {
      hasToken: !!token,
      tokenLength: token?.length,
      hasUser: !!user
    });

    // Store module-specific token (don't clear other modules)
    const tokenKey = `${module}_accessToken`;
    const authKey = `${module}_authenticated`;
    const userKey = `${module}_user`;

    safeStorage.setItem(tokenKey, token);
    safeStorage.setItem(authKey, 'true');

    if (module === 'user' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('showLocationPromptAfterLogin', 'true');
      safeStorage.removeItem('locationPromptDismissed');
    }
    
    if (user) {
      try {
        safeStorage.setItem(userKey, JSON.stringify(user));
      } catch (userError) {
        console.warn('Failed to store user data, but token was stored:', userError);
        // Don't throw - token storage is more important
      }
    }

    // Verify the token was stored correctly
    const storedToken = safeStorage.getItem(tokenKey);
    const storedAuth = safeStorage.getItem(authKey);
    
    if (storedToken !== token) {
      console.error(`[setAuthData] Token mismatch:`, {
        expected: token?.substring(0, 20) + '...',
        stored: storedToken?.substring(0, 20) + '...'
      });
      throw new Error(`Token storage verification failed for module: ${module}`);
    }

    if (storedAuth !== 'true') {
      console.error(`[setAuthData] Auth flag mismatch:`, {
        expected: 'true',
        stored: storedAuth
      });
      throw new Error(`Authentication flag storage failed for module: ${module}`);
    }

    console.log(`[setAuthData] Successfully stored auth data for ${module}`);
  } catch (error) {
    // If quota exceeded, try to clear some space
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.warn('localStorage quota exceeded. Attempting to clear old data...');
      // Clear legacy tokens
      try {
        safeStorage.removeItem('accessToken');
        safeStorage.removeItem('user');
        // Retry storing
        safeStorage.setItem(`${module}_accessToken`, token);
        safeStorage.setItem(`${module}_authenticated`, 'true');
        if (user) {
          safeStorage.setItem(`${module}_user`, JSON.stringify(user));
        }
        
        // Verify again after retry
        const storedToken = safeStorage.getItem(`${module}_accessToken`);
        if (storedToken !== token) {
          throw new Error('Token storage failed even after clearing space');
        }
      } catch (retryError) {
        console.error('Failed to store auth data after clearing space:', retryError);
        throw new Error('Unable to store authentication data. Please clear browser storage and try again.');
      }
    } else {
      console.error('[setAuthData] Error storing auth data:', error);
      throw error;
    }
  }
}

