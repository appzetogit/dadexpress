import { Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { isModuleAuthenticated } from "@/lib/utils/auth";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module
 */
export default function ProtectedRoute({ children, requiredRole, loginPath }) {
  const location = useLocation();

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

  // Restaurant-specific guard: if auth exists but profile is incomplete, force onboarding.
  // Backward compatible: only triggers when backend/client stored `isProfileCompleted === false`.
  if (requiredRole === "restaurant") {
    try {
      const raw = localStorage.getItem("restaurant_user");
      if (raw) {
        const user = JSON.parse(raw);
        const needsOnboarding = user?.isProfileCompleted === false;
        const isOnboardingRoute = location.pathname.startsWith("/restaurant/onboarding");
        if (needsOnboarding && !isOnboardingRoute) {
          return <Navigate to="/restaurant/onboarding" replace />;
        }
      }
    } catch {
      // ignore storage parsing issues
    }
  }

  return children;
}
