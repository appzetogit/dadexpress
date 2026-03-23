const STORAGE_KEY = "selectedDeliveryAddress";
const STORAGE_EVENT = "delivery-address-selected";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAddressId = (address) => address?.id || address?._id || null;

const isValidCoords = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

const buildAddressFromCurrentLocation = (currentLocation, fallbackAddress = null) => {
  if (!currentLocation) return null;

  const latitude = toNumber(currentLocation.latitude);
  const longitude = toNumber(currentLocation.longitude);
  const formattedAddress =
    currentLocation.formattedAddress ||
    currentLocation.address ||
    currentLocation.city ||
    "";

  const base = {
    ...(fallbackAddress || {}),
    formattedAddress,
    address: currentLocation.address || formattedAddress,
    street: currentLocation.street || currentLocation.address || "",
    city: currentLocation.city || "",
    state: currentLocation.state || "",
    zipCode: currentLocation.postalCode || currentLocation.zipCode || "",
    area: currentLocation.area || "",
  };

  if (isValidCoords(latitude, longitude)) {
    base.location = {
      ...(base.location || {}),
      coordinates: [longitude, latitude],
    };
  }

  return base;
};

const normalizeSavedAddress = (address) => {
  if (!address) return null;
  const coords = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : null;
  const longitude = toNumber(coords?.[0] ?? address.longitude);
  const latitude = toNumber(coords?.[1] ?? address.latitude);
  const formattedAddress = address.formattedAddress || address.address || "";

  const normalized = {
    ...address,
    formattedAddress,
  };

  if (isValidCoords(latitude, longitude)) {
    normalized.location = {
      ...(address.location || {}),
      coordinates: [longitude, latitude],
    };
  }

  return normalized;
};

export const getSelectedDeliveryAddress = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const mode = parsed.mode === "current" || parsed.mode === "saved" ? parsed.mode : null;
    const addressId = parsed.addressId ? String(parsed.addressId) : null;
    return mode ? { mode, addressId } : null;
  } catch {
    return null;
  }
};

export const setSelectedDeliveryAddress = (value) => {
  if (!value || !value.mode) {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: null }));
    return;
  }

  const payload = {
    mode: value.mode,
    addressId: value.addressId ? String(value.addressId) : null,
    updatedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: payload }));
};

export const resolveDeliveryAddress = ({
  selected,
  addresses = [],
  currentLocation = null,
  fallbackAddress = null,
} = {}) => {
  const selectedMode = selected?.mode || null;
  const selectedId = selected?.addressId ? String(selected.addressId) : null;
  const normalizedFallback = normalizeSavedAddress(fallbackAddress);

  if (selectedMode === "saved" && selectedId) {
    const matched = addresses.find((addr) => String(getAddressId(addr)) === selectedId);
    const normalized = normalizeSavedAddress(matched);
    const coords = normalized?.location?.coordinates || null;
    const latitude = toNumber(coords?.[1]);
    const longitude = toNumber(coords?.[0]);
    if (!normalized) {
      return {
        address: null,
        coords: null,
        source: "saved",
        error: "Selected address not found",
      };
    }
    if (!isValidCoords(latitude, longitude)) {
      return {
        address: normalized,
        coords: null,
        source: "saved",
        error: "Invalid coordinates for selected address",
      };
    }
    return {
      address: normalized,
      coords: { lat: latitude, lng: longitude },
      source: "saved",
      error: null,
    };
  }

  if (selectedMode === "current") {
    const currentAddress = buildAddressFromCurrentLocation(currentLocation, normalizedFallback);
    const coords = currentAddress?.location?.coordinates || null;
    const latitude = toNumber(coords?.[1]);
    const longitude = toNumber(coords?.[0]);
    if (!currentAddress) {
      return {
        address: null,
        coords: null,
        source: "current",
        error: "Current location unavailable",
      };
    }
    if (!isValidCoords(latitude, longitude)) {
      return {
        address: currentAddress,
        coords: null,
        source: "current",
        error: "Invalid coordinates for current location",
      };
    }
    return {
      address: currentAddress,
      coords: { lat: latitude, lng: longitude },
      source: "current",
      error: null,
    };
  }

  if (normalizedFallback) {
    const fallbackCoords = normalizedFallback?.location?.coordinates || null;
    const fallbackLat = toNumber(fallbackCoords?.[1]);
    const fallbackLng = toNumber(fallbackCoords?.[0]);
    if (isValidCoords(fallbackLat, fallbackLng)) {
      return {
        address: normalizedFallback,
        coords: { lat: fallbackLat, lng: fallbackLng },
        source: "saved",
        error: null,
      };
    }
    return {
      address: normalizedFallback,
      coords: null,
      source: "saved",
      error: "Invalid coordinates for default address",
    };
  }

  const currentFallback = buildAddressFromCurrentLocation(currentLocation, normalizedFallback);
  const currentCoords = currentFallback?.location?.coordinates || null;
  const currentLat = toNumber(currentCoords?.[1]);
  const currentLng = toNumber(currentCoords?.[0]);

  if (isValidCoords(currentLat, currentLng)) {
    return {
      address: currentFallback,
      coords: { lat: currentLat, lng: currentLng },
      source: "current",
      error: null,
    };
  }

  return {
    address: null,
    coords: null,
    source: null,
    error: "No delivery address available",
  };
};

export const DELIVERY_ADDRESS_EVENT = STORAGE_EVENT;
