import axios from "axios";
import { toast } from "sonner";
import { API_BASE_URL } from "./config.js";
import { getRoleFromToken, clearModuleAuth } from "../utils/auth.js";

// Network error tracking to prevent spam
const networkErrorState = {
  lastErrorTime: 0,
  lastToastTime: 0,
  errorCount: 0,
  toastShown: false,
  COOLDOWN_PERIOD: 30000, // 30 seconds cooldown for console errors
  TOAST_COOLDOWN_PERIOD: 60000, // 60 seconds cooldown for toast notifications
};

const BACKEND_DOWN_TOAST_KEY = "backend_connection_toast_shown";

const hasShownBackendDownToast = () => {
  try {
    return sessionStorage.getItem(BACKEND_DOWN_TOAST_KEY) === "true";
  } catch {
    return networkErrorState.toastShown;
  }
};

const markBackendDownToastShown = () => {
  networkErrorState.toastShown = true;
  try {
    sessionStorage.setItem(BACKEND_DOWN_TOAST_KEY, "true");
  } catch {
    // Ignore storage access failures and rely on in-memory fallback.
  }
};

const clearBackendDownToastState = () => {
  networkErrorState.errorCount = 0;
  networkErrorState.lastErrorTime = 0;
  networkErrorState.lastToastTime = 0;
  networkErrorState.toastShown = false;
  try {
    sessionStorage.removeItem(BACKEND_DOWN_TOAST_KEY);
  } catch {
    // Ignore storage access failures and rely on in-memory fallback.
  }
};

// Validate API base URL on import
if (import.meta.env.DEV) {
  const backendUrl = API_BASE_URL.replace("/api", "");
  const frontendUrl = window.location.origin;

  if (API_BASE_URL.includes("5173") || backendUrl.includes("5173")) {
    console.error(
      "❌ CRITICAL: API_BASE_URL is pointing to FRONTEND port (5173) instead of BACKEND port (5000)",
    );
    console.error("💡 Current API_BASE_URL:", API_BASE_URL);
    console.error("💡 Frontend URL:", frontendUrl);
    console.error("💡 Backend should be at: http://localhost:5000");
    console.error(
      "💡 Fix: Check .env file - VITE_API_BASE_URL should be http://localhost:5000/api",
    );
  } else {
    false && console.log("✅ API_BASE_URL correctly points to backend:", API_BASE_URL);
    false && console.log("✅ Backend URL:", backendUrl);
    false && console.log("✅ Frontend URL:", frontendUrl);
  }
}

/**
 * Create axios instance with default configuration
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60 seconds - increased for slow server handling
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Include cookies for refresh token
});

/**
 * Get the appropriate module token based on the current route
 * @returns {string|null} - Access token for the current module or null
 */
function getTokenForCurrentRoute() {
  const path = window.location.pathname;

  if (path.startsWith("/admin")) {
    return localStorage.getItem("admin_accessToken");
  } else if (
    path.startsWith("/restaurant") &&
    !path.startsWith("/restaurants") &&
    !path.startsWith("/restaurant/list") &&
    !path.startsWith("/restaurant/under-250")
  ) {
    // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
    // Exclude public routes like /restaurant/list and /restaurant/under-250
    return localStorage.getItem("restaurant_accessToken");
  } else if (path.startsWith("/delivery")) {
    return localStorage.getItem("delivery_accessToken");
  } else if (
    path.startsWith("/user") ||
    path.startsWith("/usermain") ||
    path === "/" ||
    (!path.startsWith("/admin") &&
      !(path.startsWith("/restaurant") && !path.startsWith("/restaurants")) &&
      !path.startsWith("/delivery"))
  ) {
    // User module includes /restaurants/* and /usermain/* paths
    return localStorage.getItem("user_accessToken");
  }

  // Fallback to legacy token for backward compatibility
  return localStorage.getItem("accessToken");
}

/**
 * Request Interceptor
 * Adds authentication token to requests based on current route
 */
apiClient.interceptors.request.use(
  (config) => {
    // Get access token for the current module based on route
    let accessToken = getTokenForCurrentRoute();

    // Fallback to legacy token if module-specific token not found
    if (!accessToken || accessToken.trim() === "") {
      accessToken = localStorage.getItem("accessToken");
    }

    // Ensure headers object exists
    if (!config.headers) {
      config.headers = {};
    }

    // Debug logging for FormData requests
    if (import.meta.env.DEV && config.data instanceof FormData) {
      false && console.log("[API Interceptor] FormData request detected:", {
        url: config.url,
        method: config.method,
        hasAuthHeader: !!config.headers.Authorization,
        authHeaderPrefix: config.headers.Authorization?.substring(0, 30),
        hasAccessToken: !!accessToken,
      });
    }

    // Determine if this is an authenticated route
    const path = window.location.pathname;
    const requestUrl = config.url || "";

    // Check if this is a public restaurant route (should not require authentication)
    const isPublicRestaurantRoute =
      requestUrl.includes("/restaurant/list") ||
      requestUrl.includes("/restaurant/under-250") ||
      (requestUrl.includes("/restaurant/") &&
        !requestUrl.includes("/restaurant/orders") &&
        !requestUrl.includes("/restaurant/auth") &&
        !requestUrl.includes("/restaurant/menu") &&
        !requestUrl.includes("/restaurant/profile") &&
        !requestUrl.includes("/restaurant/staff") &&
        !requestUrl.includes("/restaurant/offers") &&
        !requestUrl.includes("/restaurant/inventory") &&
        !requestUrl.includes("/restaurant/categories") &&
        !requestUrl.includes("/dining/") &&
        !requestUrl.includes("/restaurant/onboarding") &&
        !requestUrl.includes("/restaurant/delivery-status") &&
        !requestUrl.includes("/restaurant/finance") &&
        !requestUrl.includes("/restaurant/wallet") &&
        !requestUrl.includes("/restaurant/analytics") &&
        !requestUrl.includes("/restaurant/complaints") &&
        (requestUrl.match(/\/restaurant\/[^/]+$/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/menu/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/addons/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/inventory/) ||
          requestUrl.match(/\/restaurant\/[^/]+\/offers/)));

    const isAuthenticatedRoute =
      (path.startsWith("/admin") ||
        (path.startsWith("/restaurant") &&
          !path.startsWith("/restaurants") &&
          !isPublicRestaurantRoute) ||
        path.startsWith("/delivery")) &&
      !isPublicRestaurantRoute;

    // For authenticated routes, ALWAYS ensure Authorization header is set if we have a token
    // This ensures FormData requests and other requests always have the token
    if (isAuthenticatedRoute) {
      // If no Authorization header or invalid format, set it
      if (
        !config.headers.Authorization ||
        (typeof config.headers.Authorization === "string" &&
          !config.headers.Authorization.startsWith("Bearer "))
      ) {
        if (
          accessToken &&
          accessToken.trim() !== "" &&
          accessToken !== "null" &&
          accessToken !== "undefined"
        ) {
          config.headers.Authorization = `Bearer ${accessToken.trim()}`;
          if (import.meta.env.DEV && config.data instanceof FormData) {
            false && console.log(
              "[API Interceptor] Added Authorization header for authenticated FormData request",
            );
          }
        } else {
          // Log warning in development if token is missing for authenticated routes
          if (import.meta.env.DEV) {
            false && console.warn(
              `[API Interceptor] No access token found for authenticated route: ${path}. Request may fail with 401.`,
            );
            false && console.warn(`[API Interceptor] Available tokens:`, {
              admin: localStorage.getItem("admin_accessToken")
                ? "exists"
                : "missing",
              restaurant: localStorage.getItem("restaurant_accessToken")
                ? "exists"
                : "missing",
              delivery: localStorage.getItem("delivery_accessToken")
                ? "exists"
                : "missing",
              user: localStorage.getItem("user_accessToken")
                ? "exists"
                : "missing",
              legacy: localStorage.getItem("accessToken")
                ? "exists"
                : "missing",
            });
          }
        }
      } else {
        // Authorization header already set (from getAuthConfig), log in dev mode for FormData
        if (import.meta.env.DEV && config.data instanceof FormData) {
          false && console.log(
            "[API Interceptor] Authorization header already set, preserving it for FormData request",
          );
        }
      }
    } else {
      // For non-authenticated routes (including public restaurant routes), don't add token
      // Public routes like /restaurant/list should work without authentication
      if (isPublicRestaurantRoute) {
        // Remove any existing Authorization header for public routes
        delete config.headers.Authorization;
      } else if (
        !config.headers.Authorization &&
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // For other non-authenticated routes, add token if available (for optional auth)
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
    }

    // If data is FormData, remove Content-Type header to let axios set it with boundary
    // BUT: Make sure Authorization header is preserved
    if (config.data instanceof FormData) {
      // Preserve Authorization header before removing Content-Type
      const authHeader = config.headers.Authorization;
      // Remove Content-Type to let axios set it with proper boundary
      delete config.headers["Content-Type"];
      // Always restore Authorization header if it was set (critical for authentication)
      if (authHeader) {
        config.headers.Authorization = authHeader;
        if (import.meta.env.DEV) {
          false && console.log(
            "[API Interceptor] Preserved Authorization header for FormData request",
          );
        }
      } else if (
        accessToken &&
        accessToken.trim() !== "" &&
        accessToken !== "null" &&
        accessToken !== "undefined"
      ) {
        // If no auth header but we have a token, add it
        config.headers.Authorization = `Bearer ${accessToken.trim()}`;
        if (import.meta.env.DEV) {
          false && console.log(
            "[API Interceptor] Added Authorization header for FormData request",
          );
        }
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response Interceptor
 * Handles token refresh and error responses
 */
apiClient.interceptors.response.use(
  (response) => {
    // Reset network error state on successful response (backend is back online)
    if (networkErrorState.errorCount > 0 || hasShownBackendDownToast()) {
      clearBackendDownToastState();
      toast.dismiss("network-error-toast");
      if (import.meta.env.DEV) {
        false && console.log("✅ Backend connection restored");
      }
    }

    // If response contains new access token, store it for the current module
    if (response.data?.accessToken) {
      const currentPath = window.location.pathname;
      let tokenKey = "user_accessToken"; // fallback
      let expectedRole = "user";

      if (currentPath.startsWith("/admin")) {
        tokenKey = "admin_accessToken";
        expectedRole = "admin";
      } else if (
        currentPath.startsWith("/restaurant") &&
        !currentPath.startsWith("/restaurants")
      ) {
        // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
        tokenKey = "restaurant_accessToken";
        expectedRole = "restaurant";
      } else if (currentPath.startsWith("/delivery")) {
        tokenKey = "delivery_accessToken";
        expectedRole = "delivery";
      }

      const token = response.data.accessToken;
      const role = getRoleFromToken(token);

      // Only store the token if the role matches the current module
      if (!role || role !== expectedRole) {
        clearModuleAuth(tokenKey.replace("_accessToken", ""));
      } else {
        localStorage.setItem(tokenKey, token);
      }
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};

    // Determine request URL for refresh logic
    const requestUrl = originalRequest.url || "";

    // Some endpoints are explicitly public (no auth/refresh should be attempted)
    const isPublicEndpoint =
      requestUrl.includes("/business-settings/public") ||
      requestUrl.includes("/env/public") ||
      requestUrl.includes("/categories/public") ||
      requestUrl.includes("/fee-settings/public") ||
      requestUrl.includes("/about/public") ||
      requestUrl.includes("/terms/public") ||
      requestUrl.includes("/privacy/public") ||
      requestUrl.includes("/refund/public") ||
      requestUrl.includes("/shipping/public") ||
      requestUrl.includes("/cancellation/public");

    // Auth endpoints should never trigger refresh-on-401.
    // Example: invalid login credentials must stay as "Invalid email/password",
    // not be replaced by a refresh-token failure like "No token provided".
    const isAuthEndpoint =
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/signup") ||
      requestUrl.includes("/auth/signup/otp") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/send-otp") ||
      requestUrl.includes("/auth/verify-otp") ||
      requestUrl.includes("/auth/reset-password") ||
      requestUrl.includes("/auth/firebase/google-login");

    // If error is 401 and we haven't tried to refresh yet, and this is NOT a public/auth endpoint
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isPublicEndpoint &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        // Determine which module's refresh endpoint to use based on current route
        const currentPath = window.location.pathname;
        let refreshEndpoint = "/auth/refresh-token"; // default to user auth

        if (currentPath.startsWith("/admin")) {
          refreshEndpoint = "/admin/auth/refresh-token";
        } else if (
          currentPath.startsWith("/restaurant") &&
          !currentPath.startsWith("/restaurants")
        ) {
          // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
          refreshEndpoint = "/restaurant/auth/refresh-token";
        } else if (currentPath.startsWith("/delivery")) {
          refreshEndpoint = "/delivery/auth/refresh-token";
        }

        // Try to refresh the token
        // The refresh token is sent via httpOnly cookie automatically
        const response = await axios.post(
          `${API_BASE_URL}${refreshEndpoint}`,
          {},
          {
            withCredentials: true,
          },
        );

        const { accessToken } = response.data.data || response.data;

        if (accessToken) {
          // Determine which module's token to update based on current route
          const currentPath = window.location.pathname;
          let tokenKey = "user_accessToken"; // fallback
          let expectedRole = "user";

          if (currentPath.startsWith("/admin")) {
            tokenKey = "admin_accessToken";
            expectedRole = "admin";
          } else if (
            currentPath.startsWith("/restaurant") &&
            !currentPath.startsWith("/restaurants")
          ) {
            // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
            tokenKey = "restaurant_accessToken";
            expectedRole = "restaurant";
          } else if (currentPath.startsWith("/delivery")) {
            tokenKey = "delivery_accessToken";
            expectedRole = "delivery";
          }

          const role = getRoleFromToken(accessToken);

          // Only store token if role matches expected module; otherwise treat as invalid for this module
          if (!role || role !== expectedRole) {
            clearModuleAuth(tokenKey.replace("_accessToken", ""));
            throw new Error("Role mismatch on refreshed token");
          }

          // Store new access token for the current module
          localStorage.setItem(tokenKey, accessToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        const status = refreshError.response?.status;
        const message =
          refreshError.response?.data?.message ||
          refreshError.response?.data?.error ||
          refreshError.message ||
          "";

        // Show error toast in development mode for visibility
        if (import.meta.env.DEV) {
          const refreshErrorMessage =
            message && typeof message === "string"
              ? message
              : "Token refresh failed";

          toast.error(refreshErrorMessage, {
            duration: 3000,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }

        // Determine if this is a true auth failure (expired/invalid token)
        const lowerMsg = typeof message === "string" ? message.toLowerCase() : "";
        const isAuthFailure =
          status === 401 ||
          lowerMsg.includes("invalid token") ||
          lowerMsg.includes("token expired") ||
          lowerMsg.includes("refresh token not found") ||
          lowerMsg.includes("invalid refresh token") ||
          lowerMsg.includes("role mismatch on refreshed token");

        // For network / server errors during refresh (not real auth failures),
        // don't log the user out – keep tokens and let the app retry later.
        if (!isAuthFailure) {
          return Promise.reject(refreshError);
        }

        // Refresh truly failed / token is invalid – clear module token and redirect to login,
        // except on onboarding or landing-page-management screens which handle errors themselves.
        const currentPath = window.location.pathname;
        const isOnboardingPage = currentPath.includes("/onboarding");
        const isLandingPageManagement =
          currentPath.includes("/hero-banner-management") ||
          currentPath.includes("/landing-page");

        if (!isOnboardingPage && !isLandingPageManagement) {
          const safeRedirect = (targetPath) => {
            // Prevent hard-reload redirect loops when we're already on login page.
            if (window.location.pathname !== targetPath) {
              window.location.href = targetPath;
            }
          };

          if (currentPath.startsWith("/admin")) {
            localStorage.removeItem("admin_accessToken");
            localStorage.removeItem("admin_authenticated");
            localStorage.removeItem("admin_user");
            safeRedirect("/admin/login");
          } else if (
            currentPath.startsWith("/restaurant") &&
            !currentPath.startsWith("/restaurants")
          ) {
            // /restaurant/* is for restaurant module, /restaurants/* is for user module viewing restaurants
            localStorage.removeItem("restaurant_accessToken");
            localStorage.removeItem("restaurant_authenticated");
            localStorage.removeItem("restaurant_user");
            safeRedirect("/restaurant/login");
          } else if (currentPath.startsWith("/delivery")) {
            localStorage.removeItem("delivery_accessToken");
            localStorage.removeItem("delivery_authenticated");
            localStorage.removeItem("delivery_user");
            safeRedirect("/delivery/sign-in");
          } else {
            // User module includes /restaurants/* paths
            localStorage.removeItem("user_accessToken");
            localStorage.removeItem("user_authenticated");
            localStorage.removeItem("user");
            localStorage.removeItem("user_user");
            safeRedirect("/auth/sign-in");
          }
        }

        // Let calling code know refresh ultimately failed
        return Promise.reject(refreshError);
      }
    }

    // Handle network errors specifically (backend not running)
    if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
      if (import.meta.env.DEV) {
        const now = Date.now();
        const timeSinceLastError = now - networkErrorState.lastErrorTime;
        const timeSinceLastToast = now - networkErrorState.lastToastTime;

        // Only log console errors if cooldown period has passed
        if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
          networkErrorState.errorCount++;
          networkErrorState.lastErrorTime = now;

          // Log error details (only once per cooldown period)
          if (networkErrorState.errorCount === 1) {
            // Network error logging removed - errors handled via toast notifications
          } else {
            // For subsequent errors, show a brief message
            false && console.warn(
              `⚠️ Network Error (${networkErrorState.errorCount}x) - Backend still not connected`,
            );
          }
        }

        // Show only once while backend remains disconnected.
        if (!hasShownBackendDownToast() && timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
          networkErrorState.lastToastTime = now;
          markBackendDownToastShown();

          // Show helpful error message only once until the backend responds again.
          toast.error(
            `Backend not connected. Start the backend server and refresh once it is running.`,
            {
              duration: 10000,
              id: "network-error-toast", // Use ID to prevent duplicate toasts
              style: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#ffffff",
                border: "1px solid #b45309",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
                boxShadow:
                  "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
              },
              className: "network-error-toast",
            },
          );
        }
      }
      return Promise.reject(error);
    }

    // Handle timeout errors (ECONNABORTED) with retry logic for slow server
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      // Timeout errors are usually due to slow backend or network issues
      // Retry logic: Automatically retry timeout errors up to 2 times with exponential backoff

      // SILENT: Don't show timeout toast for delivery order accept/action APIs
      // These run in background after popup is already closed
      const requestUrl = error.config?.url || ""
      const isDeliveryOrderAction =
        requestUrl.includes("/delivery/orders/") &&
        (requestUrl.includes("/accept") || requestUrl.includes("/reached-pickup") ||
          requestUrl.includes("/confirm-order-id") || requestUrl.includes("/reached-drop") ||
          requestUrl.includes("/complete-delivery"))

      if (isDeliveryOrderAction) {
        // Silently ignore - these are background calls, popup already closed
        false && console.warn("⚠️ Delivery order API timeout (background):", requestUrl)
        return Promise.reject(error)
      }

      // Retry logic for timeout errors (max 2 retries)
      const retryCount = originalRequest._retryCount || 0
      const maxRetries = 2

      // Don't retry auth endpoints or if already retried max times
      const isAuthEndpoint =
        requestUrl.includes("/auth/login") ||
        requestUrl.includes("/auth/signup") ||
        requestUrl.includes("/auth/register") ||
        requestUrl.includes("/auth/firebase/google-login")

      if (retryCount < maxRetries && !isAuthEndpoint) {
        // Increment retry count
        originalRequest._retryCount = retryCount + 1

        // Exponential backoff: wait 1s, 2s, 4s before retry
        const delay = Math.min(1000 * Math.pow(2, retryCount), 4000)

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay))

        // Retry the request with increased timeout
        originalRequest.timeout = 60000 // Keep 60s timeout for retry
        return apiClient(originalRequest)
      }

      // Max retries reached or auth endpoint - show error
      const now = Date.now()
      const timeSinceLastError = now - networkErrorState.lastErrorTime
      const timeSinceLastToast = now - networkErrorState.lastToastTime

      // Only log console errors if cooldown period has passed
      if (timeSinceLastError >= networkErrorState.COOLDOWN_PERIOD) {
        networkErrorState.errorCount++
        networkErrorState.lastErrorTime = now
      }

      // Only show toast if cooldown period has passed
      if (timeSinceLastToast >= networkErrorState.TOAST_COOLDOWN_PERIOD) {
        networkErrorState.lastToastTime = now

        // Show helpful error message (only once per minute)
        toast.error(
          `Request timeout - Backend may be slow or not responding. Please try again.`,
          {
            duration: 8000,
            id: "timeout-error-toast", // Use ID to prevent duplicate toasts
            style: {
              background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              color: "#ffffff",
              border: "1px solid #b45309",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)",
            },
            className: "timeout-error-toast",
          },
        )
      }
      return Promise.reject(error)
    }

    // Handle 404 errors (route not found)
    if (error.response?.status === 404) {
      if (import.meta.env.DEV) {
        const url = error.config?.url || "unknown";
        const fullUrl = error.config?.baseURL
          ? `${error.config.baseURL}${url}`
          : url;
        // 404 error logging removed - errors handled via toast notifications

        // Show toast for auth routes (important)
        if (
          url.includes("/auth/") ||
          url.includes("/send-otp") ||
          url.includes("/verify-otp")
        ) {
          toast.error(
            "Auth API endpoint not found. Make sure backend is running on port 5000.",
            {
              duration: 8000,
              style: {
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                color: "#ffffff",
                border: "1px solid #b91c1c",
                borderRadius: "12px",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "500",
              },
            },
          );
        }
        // Show toast for restaurant routes (but not for getRestaurantById which can legitimately return 404)
        else if (url.includes("/restaurant/")) {
          // Only show error for critical restaurant endpoints like /restaurant/list
          // Individual restaurant lookups (like /restaurant/:id) can legitimately return 404 if restaurant doesn't exist
          // So we silently handle those 404s
          const isIndividualRestaurantLookup =
            /\/restaurant\/[a-f0-9]{24}$/i.test(url) ||
            (url.match(/\/restaurant\/[^/]+$/) &&
              !url.includes("/restaurant/list"));

          if (
            !isIndividualRestaurantLookup &&
            url.includes("/restaurant/list")
          ) {
            toast.error(
              "Restaurant API endpoint not found. Check backend routes.",
              {
                duration: 5000,
                style: {
                  background:
                    "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: "#ffffff",
                  border: "1px solid #b91c1c",
                  borderRadius: "12px",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: "500",
                },
              },
            );
          }
          // Silently handle 404 for individual restaurant lookups (getRestaurantById)
          // These are expected to fail if restaurant doesn't exist in DB
        }
      }
      return Promise.reject(error);
    }

    // Show error toast in development mode only
    if (import.meta.env.DEV) {
      // Extract error messages from various possible locations
      const errorData = error.response?.data;

      // Handle array of error messages (common in validation errors)
      let errorMessages = [];

      if (Array.isArray(errorData?.message)) {
        errorMessages = errorData.message;
      } else if (Array.isArray(errorData?.errors)) {
        errorMessages = errorData.errors.map((err) => err.message || err);
      } else if (errorData?.message) {
        errorMessages = [errorData.message];
      } else if (errorData?.error) {
        errorMessages = [errorData.error];
      } else if (errorData?.data?.message) {
        errorMessages = Array.isArray(errorData.data.message)
          ? errorData.data.message
          : [errorData.data.message];
      } else if (error.message) {
        errorMessages = [error.message];
      } else {
        errorMessages = ["An error occurred"];
      }

      const shouldSuppressToast = (message) => {
        const msg = (message || "").toString().toLowerCase();
        return (
          msg.includes("outside your assigned delivery zone") ||
          msg.includes("out of zone") ||
          msg.includes("out of your zone") ||
          msg.includes("not assigned") ||
          msg.includes("order not found") ||
          // Common unauthenticated messages when user is simply not logged in
          msg.includes("no token provided") ||
          msg.includes("authentication required") ||
          msg.includes("unauthorized")
        );
      };

      // Show beautiful error toast for each error message
      errorMessages.forEach((errorMessage, index) => {
        if (shouldSuppressToast(errorMessage)) return;
        // Add slight delay for multiple toasts to appear sequentially
        setTimeout(() => {
          toast.error(errorMessage, {
            duration: 5000,
            style: {
              background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
              color: "#ffffff",
              border: "1px solid #b91c1c",
              borderRadius: "12px",
              padding: "16px",
              fontSize: "14px",
              fontWeight: "500",
              boxShadow:
                "0 10px 25px -5px rgba(239, 68, 68, 0.3), 0 8px 10px -6px rgba(239, 68, 68, 0.2)",
            },
            className: "error-toast",
          });
        }, index * 100); // Stagger multiple toasts by 100ms
      });
    }

    // Handle other errors
    return Promise.reject(error);
  },
);

export default apiClient;
