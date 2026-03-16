import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { isModuleAuthenticated } from "@/lib/utils/auth";
import Loader from "@/components/Loader";
import {
  bootstrapRestaurantSession,
  getRestaurantOnboardingTarget,
  readStoredRestaurantUser,
} from "@/module/restaurant/utils/restaurantSessionGuard";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();
  const [restaurantBootstrapDone, setRestaurantBootstrapDone] = useState(false);

  useEffect(() => {
    if (requiredRole !== "restaurant") return;

    document.body.classList.add("restaurant-module");
    const meta = document.querySelector('meta[name="viewport"]');
    const prevContent = meta?.getAttribute("content") || "";
    if (meta) {
      meta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      );
    }

    return () => {
      document.body.classList.remove("restaurant-module");
      if (meta) {
        meta.setAttribute("content", prevContent);
      }
    };
  }, [requiredRole]);

  // Check if user is authenticated for the required module using module-specific token
  if (!requiredRole) {
    // If no role required, allow access
    return children;
  }

  const isAuthenticated = isModuleAuthenticated(requiredRole);

  // If not authenticated for this module, redirect to login
  if (!isAuthenticated) {
    if (loginPath) {
      return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
    }
    
    // Fallback: redirect to appropriate login page
    const roleLoginPaths = {
      admin: "/admin/login",
      restaurant: "/restaurant/login",
      delivery: "/delivery/sign-in",
      // Canonical user login route (avoid extra /user → /auth redirect)
      user: "/auth/sign-in",
    };
    
    const redirectPath = roleLoginPaths[requiredRole] || '/';
    return <Navigate to={redirectPath} replace />;
  }

  const isRestaurant = requiredRole === "restaurant";
  const isOnboardingRoute = useMemo(
    () => location.pathname.startsWith("/restaurant/onboarding"),
    [location.pathname],
  );

  // Centralized restaurant onboarding guard:
  // - Only treat `isActive === false` as inactive elsewhere (not here)
  // - Enforce onboarding redirect only AFTER we can reliably read completion flag.
  // - On refresh/session restore where restaurant_user is missing/stale, hydrate once from /me.
  useEffect(() => {
    let cancelled = false;

    if (!isRestaurant) return;
    if (!isAuthenticated) return;

    const stored = readStoredRestaurantUser();
    const hasFlag = typeof stored?.isProfileCompleted === "boolean";

    // If we're on onboarding route, let it render even if the stored flag is missing;
    // onboarding page will fetch its own data and we hydrate in background.
    if (isOnboardingRoute && !hasFlag) {
      bootstrapRestaurantSession().finally(() => {
        if (!cancelled) setRestaurantBootstrapDone(true);
      });
      return () => {
        cancelled = true;
      };
    }

    // For other protected routes, block render until we know completion status.
    if (!hasFlag) {
      bootstrapRestaurantSession().finally(() => {
        if (!cancelled) setRestaurantBootstrapDone(true);
      });
    } else {
      setRestaurantBootstrapDone(true);
    }

    return () => {
      cancelled = true;
    };
  }, [isRestaurant, isAuthenticated, isOnboardingRoute]);

  if (isRestaurant) {
    const stored = readStoredRestaurantUser();
    const hasFlag = typeof stored?.isProfileCompleted === "boolean";

    // If we can't determine completion yet, avoid rendering protected pages.
    if (!isOnboardingRoute && !hasFlag && !restaurantBootstrapDone) {
      return <Loader />;
    }

    const resolved = hasFlag ? stored : readStoredRestaurantUser();
    const completionKnown = typeof resolved?.isProfileCompleted === "boolean";
    const needsOnboarding = resolved?.isProfileCompleted === false;

    // If we still can't determine completion after bootstrap, be conservative:
    // route to onboarding so the user can resume or the page can self-resolve.
    if (!isOnboardingRoute && !completionKnown) {
      return <Navigate to="/restaurant/onboarding" replace />;
    }

    if (needsOnboarding && !isOnboardingRoute) {
      return <Navigate to={getRestaurantOnboardingTarget(resolved)} replace />;
    }
  }

  return children;
}
