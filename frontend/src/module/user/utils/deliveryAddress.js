const STORAGE_KEY = "selectedDeliveryAddress";
const STORAGE_EVENT = "delivery-address-selected";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getAddressId = (address) => address?.id || address?._id || null;

const getAddressZoneId = (address) =>
  address?.zoneId || address?.zone?._id || address?.zone?.id || null;

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
    // No more merging with fallbackAddress to prevent 'Home' label/stale address mixing with GPS
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
    if (addresses.length === 0) {
      // We have a selection but no addresses list yet (likely loading)
      return {
        address: null,
        coords: null,
        source: "saved",
        loading: true,
        error: "Loading addresses...",
      };
    }

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
        loading: false, // Explicitly false since we checked addresses.length > 0
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
        loading: true, // Mark as loading so UI can show a spinner/locating state
        error: "Detecting your live location...",
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

  // Priority 3: Fresh GPS Location (Preferred if no selection made)
  const currentFallback = buildAddressFromCurrentLocation(currentLocation, null);
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

  // Priority 4: Saved Fallback (Home/Default) - only if GPS fails
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

  return {
    address: null,
    coords: null,
    source: null,
    error: "No delivery address available",
  };
};

export const DELIVERY_ADDRESS_EVENT = STORAGE_EVENT;

export const getAddressCoordinates = (address) => {
  if (!address) return null;
  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : Array.isArray(address.coordinates)
      ? address.coordinates
      : null;
  const longitude = toNumber(coordinates?.[0] ?? address.longitude ?? address.lng);
  const latitude = toNumber(coordinates?.[1] ?? address.latitude ?? address.lat);
  if (!isValidCoords(latitude, longitude)) return null;
  return { latitude, longitude };
};

export const hasManualSelectedAddress = () => {
  const selected = getSelectedDeliveryAddress();
  return selected?.mode === "saved" && Boolean(selected?.addressId);
};

export const resolveActiveLocation = ({ selectedAddress, currentLocation } = {}) => {
  const selectedCoords = getAddressCoordinates(selectedAddress);
  const selectedZoneId = getAddressZoneId(selectedAddress);

  if (selectedAddress && (selectedZoneId || selectedCoords)) {
    return {
      source: "SELECTED",
      ...selectedAddress,
      zoneId: selectedZoneId || null,
      coordinates: selectedCoords
        ? [selectedCoords.longitude, selectedCoords.latitude]
        : null,
    };
  }

  if (currentLocation) {
    const currentZoneId =
      currentLocation.zoneId ||
      currentLocation.zone?._id ||
      currentLocation.zone?.id ||
      null;
    if (currentZoneId) {
      const latitude = toNumber(currentLocation.latitude);
      const longitude = toNumber(currentLocation.longitude);
      return {
        source: "GPS",
        ...currentLocation,
        zoneId: currentZoneId,
        coordinates:
          isValidCoords(latitude, longitude) ? [longitude, latitude] : null,
      };
    }
  }

  return null;
};
