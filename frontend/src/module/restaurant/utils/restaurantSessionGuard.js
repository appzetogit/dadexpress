import { restaurantAPI } from "@/lib/api";
import { getModuleToken, setAuthData } from "@/lib/utils/auth";

let inFlightBootstrap = null;

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const readStoredRestaurantUser = () => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("restaurant_user");
  if (!raw) return null;
  return safeJsonParse(raw);
};

const computeIsProfileCompletedFallback = (restaurant) => {
  if (!restaurant) return undefined;
  if (typeof restaurant.isProfileCompleted === "boolean") return restaurant.isProfileCompleted;

  const completedSteps = restaurant?.onboarding?.completedSteps;
  if (typeof completedSteps === "number") return completedSteps >= 4;

  // Backward compatibility: if onboarding object doesn't exist, treat as completed.
  if (restaurant?.onboarding === undefined || restaurant?.onboarding === null) return true;

  return false;
};

export const getRestaurantOnboardingTarget = (restaurant) => {
  const step = Number(
    restaurant?.onboarding?.currentStep ??
      restaurant?.onboarding?.step ??
      restaurant?.onboarding?.incompleteStep ??
      1,
  );

  if (Number.isFinite(step) && step >= 1 && step <= 4) {
    return `/restaurant/onboarding?step=${step}`;
  }
  return "/restaurant/onboarding";
};

/**
 * Ensures `restaurant_user` in localStorage contains at least `isProfileCompleted`,
 * and comes from backend if storage is missing or stale.
 *
 * This is intentionally defensive to handle:
 * - app refresh / token restore
 * - older stored users that don't have `isProfileCompleted`
 * - direct URL access to /restaurant/*
 */
export async function bootstrapRestaurantSession({ force = false } = {}) {
  const token = getModuleToken("restaurant");
  if (!token) {
    return { ok: false, reason: "no_token", restaurant: null };
  }

  const stored = readStoredRestaurantUser();
  const storedHasCompletionFlag = typeof stored?.isProfileCompleted === "boolean";

  if (!force && stored && storedHasCompletionFlag) {
    return { ok: true, reason: "storage", restaurant: stored };
  }

  if (!force && inFlightBootstrap) return inFlightBootstrap;

  inFlightBootstrap = (async () => {
    try {
      const res = await restaurantAPI.getCurrentRestaurant();
      const payload =
        res?.data?.data?.restaurant ||
        res?.data?.data?.user ||
        res?.data?.data ||
        res?.data?.restaurant ||
        res?.data?.user ||
        null;

      if (!payload) {
        return { ok: false, reason: "empty_me", restaurant: null };
      }

      const isProfileCompleted =
        typeof payload?.isProfileCompleted === "boolean"
          ? payload.isProfileCompleted
          : computeIsProfileCompletedFallback(payload);

      const normalized = { ...payload, isProfileCompleted };

      // Persist using the existing auth helper (keeps API flow untouched).
      setAuthData("restaurant", token, normalized);
      try {
        window.dispatchEvent(new Event("restaurantAuthChanged"));
      } catch {
        // ignore
      }

      return { ok: true, reason: "api", restaurant: normalized };
    } catch (err) {
      return { ok: false, reason: "error", error: err, restaurant: null };
    } finally {
      inFlightBootstrap = null;
    }
  })();

  return inFlightBootstrap;
}

