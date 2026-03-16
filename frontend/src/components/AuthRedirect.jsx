import { Navigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { isModuleAuthenticated } from "@/lib/utils/auth"
import Loader from "@/components/Loader"
import {
  bootstrapRestaurantSession,
  getRestaurantOnboardingTarget,
  readStoredRestaurantUser,
} from "@/module/restaurant/utils/restaurantSessionGuard"

/**
 * AuthRedirect Component
 * Redirects authenticated users away from auth pages to their module's home page
 * Only shows auth pages to unauthenticated users
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Auth page component to render if not authenticated
 * @param {string} props.module - Module name (user, restaurant, delivery, admin)
 * @param {string} props.redirectTo - Path to redirect to if authenticated (optional, defaults to module home)
 */
export default function AuthRedirect({ children, module, redirectTo = null }) {
  const location = useLocation()
  const [restaurantBootstrapDone, setRestaurantBootstrapDone] = useState(false)
  // Check if user is authenticated for this module
  const isAuthenticated = isModuleAuthenticated(module)

  useEffect(() => {
    let cancelled = false

    if (module !== "restaurant") return
    if (!isAuthenticated) return

    const stored = readStoredRestaurantUser()
    const hasFlag = typeof stored?.isProfileCompleted === "boolean"
    if (hasFlag) {
      setRestaurantBootstrapDone(true)
      return
    }

    bootstrapRestaurantSession().finally(() => {
      if (!cancelled) setRestaurantBootstrapDone(true)
    })

    return () => {
      cancelled = true
    }
  }, [module, isAuthenticated])

  // Define default home pages for each module
  const moduleHomePages = {
    user: "/",
    restaurant: "/restaurant",
    delivery: "/delivery",
    admin: "/admin",
  }

  // If authenticated, redirect to module home page
  if (isAuthenticated) {
    if (module === "restaurant") {
      const stored = readStoredRestaurantUser()
      const hasFlag = typeof stored?.isProfileCompleted === "boolean"

      // If we already know profile is incomplete, onboarding redirect should win.
      if (stored?.isProfileCompleted === false) {
        return <Navigate to={getRestaurantOnboardingTarget(stored)} replace />
      }

      // If we don't know yet (old storage / refresh), hydrate once before choosing home.
      if (!hasFlag && !restaurantBootstrapDone) {
        return <Loader />
      }

      const resolved = hasFlag ? stored : readStoredRestaurantUser()
      if (resolved?.isProfileCompleted === false) {
        return <Navigate to={getRestaurantOnboardingTarget(resolved)} replace />
      }
      if (typeof resolved?.isProfileCompleted !== "boolean") {
        return <Navigate to="/restaurant/onboarding" replace />
      }

      const homePath = redirectTo || moduleHomePages[module] || "/"
      return <Navigate to={homePath} state={{ from: location.pathname }} replace />
    }

    const homePath = redirectTo || moduleHomePages[module] || "/"
    return <Navigate to={homePath} replace />
  }

  // If not authenticated, show the auth page
  return <>{children}</>
}
