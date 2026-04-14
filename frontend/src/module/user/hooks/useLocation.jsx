import { useState, useEffect, useRef } from "react"
import { locationAPI, userAPI } from "@/lib/api"
import { DELIVERY_ADDRESS_EVENT, hasManualSelectedAddress } from "../utils/deliveryAddress"

const USER_LOCATION_UPDATED_EVENT = "user-location-updated"

export function useLocation() {
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [permissionGranted, setPermissionGranted] = useState(false)

  const watchIdRef = useRef(null)
  const updateTimerRef = useRef(null)
  const prevLocationCoordsRef = useRef({ latitude: null, longitude: null })
  const isManualAddressLocked = () => hasManualSelectedAddress()
  const enforceManualModeLock = () => {
    // Manual address is the single source of truth; clear GPS cache and stop watchers.
    try {
      localStorage.removeItem("userLocation")
    } catch {}
    stopWatchingLocation()
    prevLocationCoordsRef.current = { latitude: null, longitude: null }
    setLocation(null)
    setPermissionGranted(false)
    setError(null)
  }

  /* ===================== DB UPDATE (LIVE LOCATION TRACKING) ===================== */
  const updateLocationInDB = async (locationData) => {
    try {
      const latNum = Number(locationData?.latitude)
      const lngNum = Number(locationData?.longitude)
      const hasValidCoords = Number.isFinite(latNum) && Number.isFinite(lngNum)
      if (!hasValidCoords) return

      const hasPlaceholderText =
        locationData?.city === "Current Location" ||
        locationData?.address === "Select location" ||
        locationData?.formattedAddress === "Select location"

      // Check if user is authenticated before trying to update DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB update, just use localStorage
        false && console.log("ℹ️ User not authenticated, skipping DB update (using localStorage only)")
        return
      }

      // Prepare complete location data for database storage
      const locationPayload = {
        latitude: latNum,
        longitude: lngNum,
        address: hasPlaceholderText ? "" : (locationData.address || ""),
        city: hasPlaceholderText ? "" : (locationData.city || ""),
        state: hasPlaceholderText ? "" : (locationData.state || ""),
        area: hasPlaceholderText ? "" : (locationData.area || ""),
        formattedAddress: hasPlaceholderText ? "" : (locationData.formattedAddress || locationData.address || ""),
      }

      // Add optional fields if available
      if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
        locationPayload.accuracy = locationData.accuracy
      }
      if (locationData.postalCode) {
        locationPayload.postalCode = locationData.postalCode
      }
      if (locationData.street) {
        locationPayload.street = locationData.street
      }
      if (locationData.streetNumber) {
        locationPayload.streetNumber = locationData.streetNumber
      }

      false && console.log("💾 Updating live location in database:", {
        coordinates: `${locationPayload.latitude}, ${locationPayload.longitude}`,
        formattedAddress: locationPayload.formattedAddress,
        city: locationPayload.city,
        area: locationPayload.area,
        accuracy: locationPayload.accuracy
      })

      await userAPI.updateLocation(locationPayload)

      false && console.log("✅ Live location successfully stored in database")
    } catch (err) {
      // Only log non-network and non-auth errors
      if (err.code !== "ERR_NETWORK" && err.response?.status !== 404 && err.response?.status !== 401) {
        console.error("❌ DB location update error:", err)
      } else if (err.response?.status === 404 || err.response?.status === 401) {
        // 404 or 401 means user not authenticated or route doesn't exist
        // Silently skip - this is expected for non-authenticated users
        false && console.log("ℹ️ Location update skipped (user not authenticated or route not available)")
      }
    }
  }

  // Google Places API removed - using OLA Maps only

  /* ===================== DIRECT REVERSE GEOCODE ===================== */
  const reverseGeocodeDirect = async (latitude, longitude) => {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000) // Faster timeout

      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
        { signal: controller.signal }
      )

      const data = await res.json()

      return {
        city: data.city || data.locality || "Unknown City",
        state: data.principalSubdivision || "",
        country: data.countryName || "",
        area: data.subLocality || "",
        address:
          data.formattedAddress ||
          `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        formattedAddress:
          data.formattedAddress ||
          `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      }
    } catch {
      return {
        city: "Current Location",
        address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      }
    }
  }

  /* ===================== BACKEND REVERSE GEOCODE (COST-FREE) ===================== */
  const reverseGeocodeWithGoogleMaps = async (latitude, longitude) => {
    try {
      // Use our BACKEND reverse geocode (Free + Caching)
      const response = await locationAPI.reverseGeocode(latitude, longitude);
      
      if (response?.data?.success && response.data.data?.results?.[0]) {
        const result = response.data.data.results[0];
        const components = result.address_components || {};
        
        return {
          city: components.city || components.locality || "",
          state: components.state || "",
          country: components.country || "",
          area: components.area || components.sublocality || "",
          address: result.formatted_address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: result.formatted_address || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          postalCode: components.postalCode || components.pincode || ""
        };
      }
      
      // Fallback to direct if backend fails
      return reverseGeocodeDirect(latitude, longitude);
    } catch (error) {
      console.error("Backend reverse geocode failed, using direct fallback:", error);
      return reverseGeocodeDirect(latitude, longitude);
    }
  }



  /* ===================== OLA MAPS REVERSE GEOCODE (DEPRECATED - KEPT FOR FALLBACK) ===================== */
  const reverseGeocodeWithOLAMaps = async (latitude, longitude) => {
    try {
      false && console.log("🔍 Fetching address from OLA Maps for:", latitude, longitude)

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OLA Maps API timeout")), 10000)
      )

      const apiPromise = locationAPI.reverseGeocode(latitude, longitude)
      const res = await Promise.race([apiPromise, timeoutPromise])

      // Log full response for debugging
      false && console.log("📦 Full OLA Maps API Response:", JSON.stringify(res?.data, null, 2))

      // Check if response is valid
      if (!res || !res.data) {
        throw new Error("Invalid response from OLA Maps API")
      }

      // Check if API call was successful
      if (res.data.success === false) {
        throw new Error(res.data.message || "OLA Maps API returned error")
      }

      // Backend returns: { success: true, data: { results: [{ formatted_address, address_components: { city, state, country, area } }] } }
      const backendData = res?.data?.data || {}

      // Debug: Check backend data structure
      false && console.log("🔍 Backend data structure:", {
        hasResults: !!backendData.results,
        hasResult: !!backendData.result,
        keys: Object.keys(backendData),
        dataType: typeof backendData,
        backendData: JSON.stringify(backendData, null, 2).substring(0, 500) // First 500 chars
      })

      // Handle different OLA Maps response structures
      // Backend processes OLA Maps response and returns: { results: [{ formatted_address, address_components: { city, state, area } }] }
      let result = null;
      if (backendData.results && Array.isArray(backendData.results) && backendData.results.length > 0) {
        result = backendData.results[0];
        false && console.log("✅ Using results[0] from backend")
      } else if (backendData.result && Array.isArray(backendData.result) && backendData.result.length > 0) {
        result = backendData.result[0];
        false && console.log("✅ Using result[0] from backend")
      } else if (backendData.results && !Array.isArray(backendData.results)) {
        result = backendData.results;
        false && console.log("✅ Using results object from backend")
      } else {
        result = backendData;
        false && console.log("⚠️ Using backendData directly (fallback)")
      }

      if (!result) {
        false && console.warn("⚠️ No result found in backend data")
        result = {};
      }

      false && console.log("📦 Parsed result:", {
        hasFormattedAddress: !!result.formatted_address,
        hasAddressComponents: !!result.address_components,
        formattedAddress: result.formatted_address,
        addressComponents: result.address_components
      })

      // Extract address_components - handle both object and array formats
      let addressComponents = {};
      if (result.address_components) {
        if (Array.isArray(result.address_components)) {
          // Google Maps style array
          result.address_components.forEach(comp => {
            const types = comp.types || [];
            if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('neighborhood') && !addressComponents.area) {
              addressComponents.area = comp.long_name || comp.short_name;
            } else if (types.includes('locality')) {
              addressComponents.city = comp.long_name || comp.short_name;
            } else if (types.includes('administrative_area_level_1')) {
              addressComponents.state = comp.long_name || comp.short_name;
            } else if (types.includes('country')) {
              addressComponents.country = comp.long_name || comp.short_name;
            }
          });
        } else {
          // Object format
          addressComponents = result.address_components;
        }
      } else if (result.components) {
        addressComponents = result.components;
      }

      false && console.log("📦 Parsed result structure:", {
        result,
        addressComponents,
        hasArrayComponents: Array.isArray(result.address_components),
        hasObjectComponents: !Array.isArray(result.address_components) && !!result.address_components
      })

      // Extract address details - try multiple possible response structures
      let city = addressComponents?.city ||
        result?.city ||
        result?.locality ||
        result?.address_components?.city ||
        ""

      let state = addressComponents?.state ||
        result?.state ||
        result?.administrative_area_level_1 ||
        result?.address_components?.state ||
        ""

      let country = addressComponents?.country ||
        result?.country ||
        result?.country_name ||
        result?.address_components?.country ||
        ""

      let formattedAddress = result?.formatted_address ||
        result?.formattedAddress ||
        result?.address ||
        ""

      // PRIORITY 1: Extract area from formatted_address FIRST (most reliable for Indian addresses)
      // Indian address format: "Area, City, State" e.g., "New Palasia, Indore, Madhya Pradesh"
      // ALWAYS try formatted_address FIRST - it's the most reliable source and preserves full names like "New Palasia"
      let area = ""
      if (formattedAddress) {
        const addressParts = formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

        false && console.log("🔍 Parsing formatted address for area:", { formattedAddress, addressParts, city, state, currentArea: area })

        // ZOMATO-STYLE: If we have 3+ parts, first part is ALWAYS the area/locality
        // Format: "New Palasia, Indore, Madhya Pradesh" -> area = "New Palasia"
        if (addressParts.length >= 3) {
          const firstPart = addressParts[0]
          const secondPart = addressParts[1] // Usually city
          const thirdPart = addressParts[2]  // Usually state

          // First part is the area (e.g., "New Palasia")
          // Second part is usually city (e.g., "Indore")
          // Third part is usually state (e.g., "Madhya Pradesh")
          if (firstPart && firstPart.length > 2 && firstPart.length < 50) {
            // Make sure first part is not the same as city or state
            const firstLower = firstPart.toLowerCase()
            const cityLower = (city || secondPart || "").toLowerCase()
            const stateLower = (state || thirdPart || "").toLowerCase()

            if (firstLower !== cityLower &&
              firstLower !== stateLower &&
              !firstPart.match(/^\d+/) && // Not a number
              !firstPart.match(/^\d+\s*(km|m|meters?)$/i) && // Not a distance
              !firstLower.includes("district") && // Not a district name
              !firstLower.includes("city")) { // Not a city name
              area = firstPart
              false && console.log("✅✅✅ EXTRACTED AREA from formatted address (3+ parts):", area)

              // Also update city if second part matches better
              if (secondPart && (!city || secondPart.toLowerCase() !== city.toLowerCase())) {
                city = secondPart
              }
              // Also update state if third part matches better
              if (thirdPart && (!state || thirdPart.toLowerCase() !== state.toLowerCase())) {
                state = thirdPart
              }
            }
          }
        } else if (addressParts.length === 2 && !area) {
          // Two parts: Could be "Area, City" or "City, State"
          const firstPart = addressParts[0]
          const secondPart = addressParts[1]

          // Check if first part is city (if we already have city name)
          const isFirstCity = city && firstPart.toLowerCase() === city.toLowerCase()

          // If first part is NOT the city, it's likely the area
          if (!isFirstCity &&
            firstPart.length > 2 &&
            firstPart.length < 50 &&
            !firstPart.toLowerCase().includes("district") &&
            !firstPart.toLowerCase().includes("city") &&
            !firstPart.match(/^\d+/)) {
            area = firstPart
            false && console.log("✅ Extracted area from 2 part address:", area)
            // Update city if second part exists
            if (secondPart && !city) {
              city = secondPart
            }
          } else if (isFirstCity) {
            // First part is city, second part might be state
            // No area in this case, but update state if needed
            if (secondPart && !state) {
              state = secondPart
            }
          }
        } else if (addressParts.length === 1 && !area) {
          // Single part - could be just city or area
          const singlePart = addressParts[0]
          if (singlePart && singlePart.length > 2 && singlePart.length < 50) {
            // If it doesn't match city exactly, it might be an area
            if (!city || singlePart.toLowerCase() !== city.toLowerCase()) {
              // Don't use as area if it looks like a city name (contains common city indicators)
              if (!singlePart.toLowerCase().includes("city") &&
                !singlePart.toLowerCase().includes("district")) {
                // Could be area, but be cautious - only use if we're sure
                false && console.log("⚠️ Single part address - ambiguous, not using as area:", singlePart)
              }
            }
          }
        }
      }

      // PRIORITY 2: If still no area from formatted_address, try from address_components (fallback)
      // Note: address_components might have incomplete/truncated names like "Palacia" instead of "New Palasia"
      // So we ALWAYS prefer formatted_address extraction over address_components
      if (!area && addressComponents) {
        // Try all possible area fields (but exclude state and generic names!)
        const possibleAreaFields = [
          addressComponents.sublocality,
          addressComponents.sublocality_level_1,
          addressComponents.neighborhood,
          addressComponents.sublocality_level_2,
          addressComponents.locality,
          addressComponents.area, // Check area last
        ].filter(field => {
          // Filter out invalid/generic area names
          if (!field) return false
          const fieldLower = field.toLowerCase()
          return fieldLower !== state.toLowerCase() &&
            fieldLower !== city.toLowerCase() &&
            !fieldLower.includes("district") &&
            !fieldLower.includes("city") &&
            field.length > 3 // Minimum length
        })

        if (possibleAreaFields.length > 0) {
          const fallbackArea = possibleAreaFields[0]
          // CRITICAL: If formatted_address exists and has a different area, prefer formatted_address
          // This ensures "New Palasia" from formatted_address beats "Palacia" from address_components
          if (formattedAddress && formattedAddress.toLowerCase().includes(fallbackArea.toLowerCase())) {
            // formatted_address contains the fallback area, so it's likely more complete
            // Try one more time to extract from formatted_address
            false && console.log("⚠️ address_components has area but formatted_address might have full name, re-checking formatted_address")
          } else {
            area = fallbackArea
            false && console.log("✅ Extracted area from address_components (fallback):", area)
          }
        }
      }

      // Also check address_components array structure (Google Maps style)
      if (!area && result?.address_components && Array.isArray(result.address_components)) {
        const components = result.address_components
        // Find sublocality or neighborhood in the components array
        const sublocality = components.find(comp =>
          comp.types?.includes('sublocality') ||
          comp.types?.includes('sublocality_level_1') ||
          comp.types?.includes('neighborhood')
        )
        if (sublocality?.long_name || sublocality?.short_name) {
          area = sublocality.long_name || sublocality.short_name
        }
      }

      // FINAL FALLBACK: If area is still empty, force extract from formatted_address
      // This is the last resort - be very aggressive (ZOMATO-STYLE)
      // Even if formatted_address only has 2 parts (City, State), try to extract area
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)
        false && console.log("🔍 Final fallback: Parsing formatted_address for area", { parts, city, state })

        if (parts.length >= 2) {
          const potentialArea = parts[0]
          // Very lenient check - if it's not obviously city/state, use it as area
          const potentialAreaLower = potentialArea.toLowerCase()
          const cityLower = (city || "").toLowerCase()
          const stateLower = (state || "").toLowerCase()

          if (potentialArea &&
            potentialArea.length > 2 &&
            potentialArea.length < 50 &&
            !potentialArea.match(/^\d+/) &&
            potentialAreaLower !== cityLower &&
            potentialAreaLower !== stateLower &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            false && console.log("✅✅✅ FORCE EXTRACTED area (final fallback):", area)
          }
        }
      }

      // Final validation and logging
      false && console.log("✅✅✅ FINAL PARSED OLA Maps response:", {
        city,
        state,
        country,
        area,
        formattedAddress,
        hasArea: !!area,
        areaLength: area?.length || 0
      })

      // CRITICAL: If formattedAddress has only 2 parts, OLA Maps didn't provide sublocality
      // Try to get more detailed location using coordinates-based search
      if (!area && formattedAddress) {
        const parts = formattedAddress.split(',').map(p => p.trim()).filter(p => p.length > 0)

        // If we have 3+ parts, extract area from first part
        if (parts.length >= 3) {
          // ZOMATO PATTERN: "New Palasia, Indore, Madhya Pradesh"
          // First part = Area, Second = City, Third = State
          const potentialArea = parts[0]
          // Validate it's not state, city, or generic names
          const potentialAreaLower = potentialArea.toLowerCase()
          if (potentialAreaLower !== state.toLowerCase() &&
            potentialAreaLower !== city.toLowerCase() &&
            !potentialAreaLower.includes("district") &&
            !potentialAreaLower.includes("city")) {
            area = potentialArea
            if (!city && parts[1]) city = parts[1]
            if (!state && parts[2]) state = parts[2]
            false && console.log("✅✅✅ ZOMATO-STYLE EXTRACTION:", { area, city, state })
          }
        } else if (parts.length === 2) {
          // Only 2 parts: "Indore, Madhya Pradesh" - area is missing
          // OLA Maps API didn't provide sublocality
          false && console.warn("⚠️ Only 2 parts in address - OLA Maps didn't provide sublocality")
          // Try to extract from other fields in the response
          // Check if result has any other location fields
          if (result.locality && result.locality !== city) {
            area = result.locality
            false && console.log("✅ Using locality as area:", area)
          } else if (result.neighborhood) {
            area = result.neighborhood
            false && console.log("✅ Using neighborhood as area:", area)
          } else {
            // Leave area empty - will show city instead
            area = ""
          }
        }
      }

      // FINAL VALIDATION: Never use state as area!
      if (area && state && area.toLowerCase() === state.toLowerCase()) {
        false && console.warn("⚠️⚠️⚠️ REJECTING area (same as state):", area)
        area = ""
      }

      // FINAL VALIDATION: Reject district names
      if (area && area.toLowerCase().includes("district")) {
        false && console.warn("⚠️⚠️⚠️ REJECTING area (contains district):", area)
        area = ""
      }

      // If we have a valid formatted address or city, return it
      if (formattedAddress || city) {
        const finalLocation = {
          city: city || "Unknown City",
          state: state || "",
          country: country || "",
          area: area || "", // Area is CRITICAL - must be extracted
          address: formattedAddress || `${city || "Current Location"}`,
          formattedAddress: formattedAddress || `${city || "Current Location"}`,
        }

        false && console.log("✅✅✅ RETURNING LOCATION DATA:", finalLocation)
        return finalLocation
      }

      // If no valid data, throw to trigger fallback
      throw new Error("No valid address data from OLA Maps")
    } catch (err) {
      false && console.warn("⚠️ Google Maps failed, trying direct geocoding:", err.message)
      // Fallback to direct reverse geocoding (no Google Maps dependency)
      try {
        return await reverseGeocodeWithGoogleMaps(latitude, longitude)
      } catch (fallbackErr) {
        // If all fail, return minimal location data
        console.error("❌ All reverse geocoding failed:", fallbackErr)
        return {
          city: "Current Location",
          address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        }
      }
    }
  }

  /* ===================== DB FETCH ===================== */
  const fetchLocationFromDB = async () => {
    try {
      // Check if user is authenticated before trying to fetch from DB
      const userToken = localStorage.getItem('user_accessToken') || localStorage.getItem('accessToken')
      if (!userToken || userToken === 'null' || userToken === 'undefined') {
        // User not logged in - skip DB fetch, return null to use localStorage
        return null
      }

      const res = await userAPI.getLocation()
      const loc = res?.data?.data?.location
      if (loc?.latitude && loc?.longitude) {
        // Validate coordinates are in India range BEFORE attempting geocoding
        const isInIndiaRange = loc.latitude >= 6.5 && loc.latitude <= 37.1 && loc.longitude >= 68.7 && loc.longitude <= 97.4 && loc.longitude > 0

        if (!isInIndiaRange || loc.longitude < 0) {
          // Coordinates are outside India - return placeholder
          false && console.warn("⚠️ Coordinates from DB are outside India range:", { latitude: loc.latitude, longitude: loc.longitude })
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            state: "",
            country: "",
            area: "",
            address: "Select location",
            formattedAddress: "Select location",
          }
        }

        try {
          const addr = await reverseGeocodeWithGoogleMaps(
            loc.latitude,
            loc.longitude
          )
          return { ...addr, latitude: loc.latitude, longitude: loc.longitude }
        } catch (geocodeErr) {
          // If reverse geocoding fails, return location without coordinates in address
          false && console.warn("⚠️ Reverse geocoding failed in fetchLocationFromDB:", geocodeErr.message)
          return {
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: "Current Location",
            area: "",
            state: "",
            address: "Select location", // Don't show coordinates
            formattedAddress: "Select location", // Don't show coordinates
          }
        }
      }
    } catch (err) {
      // Silently fail for 404/401 (user not authenticated), network errors, or aborted/Cancelled requests
      const status = err.response?.status
      const isNetworkError = err.code === "ERR_NETWORK"
      const isAuthOrNotFound = status === 404 || status === 401
      const message = err.message || ""
      const isAborted =
        err.code === "ERR_CANCELED" ||
        message.toLowerCase().includes("aborted") ||
        message.toLowerCase().includes("canceled")

      if (!isNetworkError && !isAuthOrNotFound && !isAborted) {
        console.error("DB location fetch error:", err)
      }
    }
    return null
  }

  /* ===================== MAIN LOCATION ===================== */
  const getLocation = async (updateDB = true, forceFresh = false, showLoading = false) => {
    // If not forcing fresh, try DB first (faster)
    let dbLocation = !forceFresh ? await fetchLocationFromDB() : null
    if (dbLocation && !forceFresh) {
      setLocation(dbLocation)
      if (showLoading) setLoading(false)
      return dbLocation
    }

    // Strict isolation: when manual address is selected, do not invoke GPS.
    if (isManualAddressLocked()) {
      if (showLoading) setLoading(false)
      return dbLocation || location || null
    }

    if (!navigator.geolocation) {
      setError("Geolocation not supported")
      if (showLoading) setLoading(false)
      return dbLocation
    }

    // Helper function to get position with retry mechanism
    const getPositionWithRetry = (options, retryCount = 0) => {
      return new Promise((resolve, reject) => {
        const isRetry = retryCount > 0
        false && console.log(`📍 Requesting location${isRetry ? ' (retry with lower accuracy)' : ' (high accuracy)'}...`)
        false && console.log(`📍 Force fresh: ${forceFresh ? 'YES' : 'NO'}, maximumAge: ${options.maximumAge || (forceFresh ? 0 : 60000)}`)

        // Use cached location if available and not too old (faster response)
        // If forceFresh is true, don't use cache (maximumAge: 0)
        const cachedOptions = {
          ...options,
          maximumAge: forceFresh ? 0 : (options.maximumAge || 60000), // If forceFresh, get fresh location
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              if (isManualAddressLocked()) {
                if (showLoading) setLoading(false)
                return resolve(location || dbLocation || null)
              }

              const { latitude, longitude, accuracy } = pos.coords
              const timestamp = pos.timestamp || Date.now()

              false && console.log(`✅ Got location${isRetry ? ' (lower accuracy)' : ' (high accuracy)'}:`, {
                latitude,
                longitude,
                accuracy: `${accuracy}m`,
                timestamp: new Date(timestamp).toISOString(),
                coordinates: `${latitude.toFixed(8)}, ${longitude.toFixed(8)}`
              })

              // Fetch address using reverse geocoding
              // This is necessary to show the "Exact location name" (city, area, etc.)
              const addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)
              false && console.log("📍 Reverse geocoding result:", addr)

              // Ensure we don't use coordinates as address if we have area/city
              // Keep the complete formattedAddress from Google Maps (it has all details)
              const completeFormattedAddress = addr.formattedAddress || "";
              let displayAddress = addr.address || "";

              // If address contains coordinates pattern, use area/city instead
              const isCoordinatesPattern = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());
              if (isCoordinatesPattern) {
                if (addr.area && addr.area.trim() !== "") {
                  displayAddress = addr.area;
                } else if (addr.city && addr.city.trim() !== "" && addr.city !== "Unknown City") {
                  displayAddress = addr.city;
                }
              }

              // Build location object with ALL fields from reverse geocoding
              const finalLoc = {
                ...addr, // This includes: city, state, area, street, streetNumber, postalCode, formattedAddress
                latitude,
                longitude,
                accuracy: accuracy || null,
                address: displayAddress, // Locality parts for navbar display
                formattedAddress: completeFormattedAddress || addr.formattedAddress || displayAddress // Complete detailed address
              }

              // Check if location has placeholder values - don't save placeholders
              const hasPlaceholder =
                finalLoc.city === "Current Location" ||
                finalLoc.address === "Select location" ||
                finalLoc.formattedAddress === "Select location" ||
                (!finalLoc.city && !finalLoc.address && !finalLoc.formattedAddress && !finalLoc.area);

              if (hasPlaceholder) {
                false && console.warn("⚠️ Placeholder address detected, saving coordinates-only location")
                // Keep GPS coordinates persisted and synced even when address text is placeholder.
                const coordOnlyLoc = {
                  latitude,
                  longitude,
                  accuracy: accuracy || null,
                  city: finalLoc.city,
                  address: finalLoc.address,
                  formattedAddress: finalLoc.formattedAddress
                }
                if (!isManualAddressLocked()) {
                  localStorage.setItem("userLocation", JSON.stringify(coordOnlyLoc))
                  setLocation(coordOnlyLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) {
                    await updateLocationInDB(coordOnlyLoc).catch(() => { })
                  }
                }
                resolve(coordOnlyLoc)
                return
              }

              false && console.log("💾 Saving location:", finalLoc)
              if (!isManualAddressLocked()) {
                localStorage.setItem("userLocation", JSON.stringify(finalLoc))
                setLocation(finalLoc)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                setError(null)

                if (updateDB) {
                  await updateLocationInDB(finalLoc).catch(err => {
                    false && console.warn("Failed to update location in DB:", err)
                  })
                }
              }
              resolve(finalLoc)
            } catch (err) {
              console.error("❌ Error processing location:", err)
              // Try one more time with direct reverse geocode as last resort
              const { latitude, longitude } = pos.coords

              try {
                false && console.log("🔄 Last attempt: trying direct reverse geocode...")
                const lastResortAddr = await reverseGeocodeDirect(latitude, longitude)

                // Check if we got valid data (not just coordinates)
                if (lastResortAddr &&
                  lastResortAddr.city !== "Current Location" &&
                  !lastResortAddr.address.includes(latitude.toFixed(4)) &&
                  lastResortAddr.formattedAddress &&
                  !lastResortAddr.formattedAddress.includes(latitude.toFixed(4))) {
                  const lastResortLoc = {
                    ...lastResortAddr,
                    latitude,
                    longitude,
                    accuracy: pos.coords.accuracy || null
                  }
                  false && console.log("✅ Last resort geocoding succeeded:", lastResortLoc)
                  localStorage.setItem("userLocation", JSON.stringify(lastResortLoc))
                  setLocation(lastResortLoc)
                  setPermissionGranted(true)
                  if (showLoading) setLoading(false)
                  setError(null)
                  if (updateDB) await updateLocationInDB(lastResortLoc).catch(() => { })
                  resolve(lastResortLoc)
                  return
                } else {
                  false && console.warn("⚠️ Last resort geocoding returned invalid data:", lastResortAddr)
                }
              } catch (lastErr) {
                console.error("❌ Last resort geocoding also failed:", lastErr.message)
              }

              // If all geocoding fails, use placeholder but don't save
              const fallbackLoc = {
                latitude,
                longitude,
                city: "Current Location",
                area: "",
                state: "",
                address: "Select location", // Don't show coordinates
                formattedAddress: "Select location", // Don't show coordinates
              }
              // Don't save placeholder values to localStorage
              // Only set in state for display
              false && console.warn("⚠️ Skipping save - all geocoding failed, using placeholder")
              const hasStableExistingLocation =
                location &&
                location.formattedAddress &&
                location.formattedAddress !== "Select location"

              if (hasStableExistingLocation) {
                // Keep current valid location so checkout state doesn't regress to "Select location".
                setLocation(location)
                setPermissionGranted(true)
                if (showLoading) setLoading(false)
                resolve(location)
                return
              }

              setLocation(fallbackLoc)
              setPermissionGranted(true)
              if (showLoading) setLoading(false)
              // Don't try to update DB with placeholder
              resolve(fallbackLoc)
            }
          },
          async (err) => {
            // If timeout and we haven't retried yet, try with lower accuracy
            if (err.code === 3 && retryCount === 0 && options.enableHighAccuracy) {
              false && console.warn("⏱️ High accuracy timeout, retrying with lower accuracy...")
              // Retry with lower accuracy - faster response (uses network-based location)
              getPositionWithRetry({
                enableHighAccuracy: false,
                timeout: 5000,  // 5 seconds for lower accuracy (network-based is faster)
                maximumAge: 300000 // Allow 5 minute old cached location for instant response
              }, 1).then(resolve).catch(reject)
              return
            }

            // Don't log timeout errors as errors - they're expected in some cases
            if (err.code === 3) {
              false && console.warn("⏱️ Geolocation timeout (code 3) - using fallback location")
            } else {
              console.error("❌ Geolocation error:", err.code, err.message)
            }
            // Try multiple fallback strategies
            try {
              // Strategy 1: Use DB location if available
              let fallback = dbLocation
              if (!fallback) {
                fallback = await fetchLocationFromDB()
              }

              // Strategy 2: Use cached location from localStorage
              if (!fallback) {
                const stored = localStorage.getItem("userLocation")
                if (stored) {
                  try {
                    fallback = JSON.parse(stored)
                    false && console.log("✅ Using cached location from localStorage")
                  } catch (parseErr) {
                    false && console.warn("⚠️ Failed to parse stored location:", parseErr)
                  }
                }
              }

              if (fallback) {
                false && console.log("✅ Using fallback location:", fallback)
                setLocation(fallback)
                // Don't set error for timeout when we have fallback
                if (err.code !== 3) {
                  setError(err.message)
                }
                setPermissionGranted(true) // Still grant permission if we have location
                if (showLoading) setLoading(false)
                resolve(fallback)
              } else {
                // No fallback available - set a default location so UI doesn't hang
                false && console.warn("⚠️ No fallback location available, setting default")
                const defaultLocation = {
                  city: "Select location",
                  address: "Select location",
                  formattedAddress: "Select location"
                }
                setLocation(defaultLocation)
                setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
                setPermissionGranted(false)
                if (showLoading) setLoading(false)
                resolve(defaultLocation) // Always resolve with something
              }
            } catch (fallbackErr) {
              false && console.warn("⚠️ Fallback retrieval failed:", fallbackErr)
              // Preserve any previously valid location so checkout/cart CTA state does not flicker.
              setLocation((currentLocation) => {
                if (
                  currentLocation &&
                  currentLocation.formattedAddress &&
                  currentLocation.formattedAddress !== "Select location"
                ) {
                  return currentLocation
                }
                return {
                  city: "Select location",
                  address: "Select location",
                  formattedAddress: "Select location"
                }
              })
              setError(err.code === 3 ? "Location request timed out. Please try again." : err.message)
              setPermissionGranted(false)
              if (showLoading) setLoading(false)
              resolve(null)
            }
          },
          options
        )
      })
    }

    // Try with high accuracy first
    // If forceFresh is true, don't use cached location (maximumAge: 0)
    // Otherwise, allow cached location for faster response
    return getPositionWithRetry({
      enableHighAccuracy: true,  // Use GPS for exact location (highest accuracy)
      timeout: 15000,            // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: forceFresh ? 0 : 60000  // If forceFresh, get fresh location. Otherwise allow 1 minute cache
    })
  }

  /* ===================== WATCH LOCATION ===================== */
  const startWatchingLocation = () => {
    if (isManualAddressLocked()) {
      stopWatchingLocation()
      return
    }
    if (!navigator.geolocation) {
      false && console.warn("⚠️ Geolocation not supported")
      return
    }

    // Clear any existing watch
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    false && console.log("👀 Starting to watch location for live updates...")

    let retryCount = 0
    const maxRetries = 2

    const startWatch = (options) => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            if (isManualAddressLocked()) {
              stopWatchingLocation()
              return
            }
            const { latitude, longitude, accuracy } = pos.coords
            false && console.log("🔄 Location updated:", { latitude, longitude, accuracy: `${accuracy}m` })

            // Reset retry count on success
            retryCount = 0

            // Fetch address using reverse geocoding
            // This is necessary to show the "Exact location name" (city, area, etc.)
            const addr = await reverseGeocodeWithGoogleMaps(latitude, longitude)
            false && console.log("🔄 Live reverse geocoding result:", addr)

            // CRITICAL: Ensure formattedAddress is NEVER coordinates
            // Check if reverse geocoding returned proper address or just coordinates
            let completeFormattedAddress = addr.formattedAddress || "";
            let displayAddress = addr.address || "";

            // Check if formattedAddress is coordinates pattern
            const isFormattedAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(completeFormattedAddress.trim());
            const isDisplayAddressCoordinates = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(displayAddress.trim());

            // If formattedAddress is coordinates, it means reverse geocoding failed
            // Build proper address from components or use fallback
            if (isFormattedAddressCoordinates || !completeFormattedAddress || completeFormattedAddress === "Select location") {
              false && console.warn("⚠️⚠️⚠️ Reverse geocoding returned coordinates or empty address!")
              false && console.warn("⚠️ Attempting to build address from components:", {
                city: addr.city,
                state: addr.state,
                area: addr.area,
                street: addr.street,
                streetNumber: addr.streetNumber
              })

              // Build address from components
              const addressParts = [];
              if (addr.area && addr.area.trim() !== "") {
                addressParts.push(addr.area);
              }
              if (addr.city && addr.city.trim() !== "") {
                addressParts.push(addr.city);
              }
              if (addr.state && addr.state.trim() !== "") {
                addressParts.push(addr.state);
              }

              if (addressParts.length > 0) {
                completeFormattedAddress = addressParts.join(', ');
                displayAddress = addr.area || addr.city || "Select location";
                false && console.log("✅ Built address from components:", completeFormattedAddress);
              } else {
                // Final fallback - don't use coordinates
                completeFormattedAddress = addr.city || "Select location";
                displayAddress = addr.city || "Select location";
                false && console.warn("⚠️ Using fallback address:", completeFormattedAddress);
              }
            }

            // Also check displayAddress
            if (isDisplayAddressCoordinates) {
              displayAddress = addr.area || addr.city || "Select location";
            }

            // Build location object with ALL fields from reverse geocoding
            // NEVER include coordinates in formattedAddress or address
            let loc = {
              ...addr, // This includes: city, state, area, street, streetNumber, postalCode
              latitude,
              longitude,
              accuracy: accuracy || null,
              address: displayAddress, // Locality parts for navbar display (NEVER coordinates)
              formattedAddress: completeFormattedAddress // Complete detailed address (NEVER coordinates)
            }

            // STABILITY: Only update if location changed significantly (>10m) OR address improved
            const currentLoc = location
            if (currentLoc && currentLoc.latitude && currentLoc.longitude) {
              // Calculate distance in meters (Haversine formula simplified for small distances)
              const latDiff = latitude - currentLoc.latitude
              const lngDiff = longitude - currentLoc.longitude
              const distanceMeters = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320 // ~111320m per degree

              // Check if address is better (more parts = more complete)
              const currentParts = (currentLoc.formattedAddress || "").split(',').filter(p => p.trim()).length
              const newParts = completeFormattedAddress.split(',').filter(p => p.trim()).length
              const addressImproved = newParts > currentParts

              // Only update if moved >150 meters OR address significantly improved
              if (distanceMeters <= 150 && !addressImproved) {
                false && console.log(`📍 Location unchanged (${distanceMeters.toFixed(1)}m change), keeping stable address`)
                return // Don't update - keep current stable address
              }

              false && console.log(`📍 Location updated: ${distanceMeters.toFixed(1)}m change, address parts: ${currentParts} → ${newParts}`)
            }

            // Final validation - ensure formattedAddress is never coordinates
            if (loc.formattedAddress && /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(loc.formattedAddress.trim())) {
              console.error("❌❌❌ CRITICAL: formattedAddress is still coordinates! Replacing with city/area")
              loc.formattedAddress = loc.area || loc.city || "Select location";
              loc.address = loc.area || loc.city || "Select location";
            }

            // Check if location has placeholder values - don't save placeholders
            const hasPlaceholder =
              loc.city === "Current Location" ||
              loc.address === "Select location" ||
              loc.formattedAddress === "Select location" ||
              (!loc.city && !loc.address && !loc.formattedAddress && !loc.area);

            if (hasPlaceholder) {
              false && console.warn("⚠️ Live update has placeholder address, syncing coordinates-only")
              const stableAddress =
                location &&
                location.formattedAddress &&
                location.formattedAddress !== "Select location" &&
                location.city !== "Current Location"
                  ? location
                  : null
              loc = {
                ...loc,
                address: stableAddress?.address || "",
                formattedAddress: stableAddress?.formattedAddress || "",
                city: stableAddress?.city || "",
                state: stableAddress?.state || "",
                area: stableAddress?.area || "",
              }
            }

            // Check if coordinates have changed significantly (threshold: ~150 meters)
            const coordThreshold = 0.001 // approximately 150 meters
            const coordsChanged =
              !prevLocationCoordsRef.current.latitude ||
              !prevLocationCoordsRef.current.longitude ||
              Math.abs(prevLocationCoordsRef.current.latitude - loc.latitude) > coordThreshold ||
              Math.abs(prevLocationCoordsRef.current.longitude - loc.longitude) > coordThreshold

            // Only update location state if coordinates changed significantly
            if (!isManualAddressLocked()) {
              if (coordsChanged) {
                prevLocationCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude }
                false && console.log("💾 Updating live location:", loc)
                localStorage.setItem("userLocation", JSON.stringify(loc))
                setLocation(loc)
                setPermissionGranted(true)
                setError(null)
              } else {
                // Coordinates haven't changed significantly, skip state update to prevent re-renders
                // Still update localStorage silently for persistence
                localStorage.setItem("userLocation", JSON.stringify(loc))
              }

              // Debounce DB updates - only update every 5 seconds
              clearTimeout(updateTimerRef.current)
              updateTimerRef.current = setTimeout(() => {
                updateLocationInDB(loc).catch(err => {
                  false && console.warn("Failed to update location in DB:", err)
                })
              }, 5000)
            }
          } catch (err) {
            console.error("❌ Error processing live location update:", err)
            // If reverse geocoding fails, DON'T use coordinates - use placeholder
            const { latitude, longitude } = pos.coords
            const fallbackLoc = {
              latitude,
              longitude,
              city: "Current Location",
              area: "",
              state: "",
              address: "Select location", // NEVER use coordinates
              formattedAddress: "Select location", // NEVER use coordinates
            }
            false && console.warn("⚠️ Using fallback location (reverse geocoding failed):", fallbackLoc)
            // Keep existing valid address instead of replacing it with a placeholder.
            // This avoids checkout CTA/state regressions caused by transient watch/update failures.
            setLocation((currentLocation) => {
              const hasStableAddress =
                currentLocation &&
                currentLocation.formattedAddress &&
                currentLocation.formattedAddress !== "Select location"

              if (hasStableAddress) {
                return currentLocation
              }
              return fallbackLoc
            })
            setPermissionGranted(true)
          }
        },
        (err) => {
          // Don't log timeout errors for watchPosition (it's a background operation)
          // Only log non-timeout errors
          if (err.code !== 3) {
            false && console.warn("⚠️ Watch position error (non-timeout):", err.code, err.message)
          }

          // If timeout and we haven't exceeded max retries, retry with HIGH ACCURACY GPS
          // CRITICAL: Keep using GPS (not network-based) for accurate location
          // Network-based location won't give exact landmarks like "Mama Loca Cafe"
          if (err.code === 3 && retryCount < maxRetries) {
            retryCount++
            false && console.log(`⏱️ GPS timeout, retrying with high accuracy GPS (attempt ${retryCount}/${maxRetries})...`)

            // Clear current watch
            if (watchIdRef.current) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }

            // Retry with HIGH ACCURACY GPS (don't use network-based location)
            // Network-based location is less accurate and won't give exact landmarks
            setTimeout(() => {
              startWatch({
                enableHighAccuracy: true,   // Keep using GPS (not network-based)
                timeout: 20000,              // 20 seconds timeout (give GPS more time)
                maximumAge: 0                // Always get fresh GPS location
              })
            }, 3000) // 3 second delay before retry
            return
          }

          // If all retries failed, silently continue - don't set error state for background watch
          // The watch will keep trying in background, user won't notice
          // Only set error for non-timeout errors that are critical
          if (err.code !== 3) {
            setError(err.message)
            setPermissionGranted(false)
          }

          // Don't clear the watch - let it keep trying in background
          // The user might move to a location with better GPS signal
        },
        options
      )
    }

    // Start with HIGH ACCURACY GPS for live location tracking
    // CRITICAL: enableHighAccuracy: true forces GPS (not network-based) for accurate location
    // Network-based location won't give exact landmarks like "Mama Loca Cafe"
    startWatch({
      enableHighAccuracy: true,   // CRITICAL: Use GPS (not network-based) for accurate location
      timeout: 15000,             // 15 seconds timeout (gives GPS more time to get accurate fix)
      maximumAge: 0               // Always get fresh GPS location (no cache for live tracking)
    })

    false && console.log("✅✅✅ GPS High Accuracy enabled for live location tracking")
    false && console.log("✅ GPS will provide accurate coordinates for reverse geocoding")
    false && console.log("✅ Network-based location disabled (less accurate)")
  }

  const stopWatchingLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearTimeout(updateTimerRef.current)
  }

  /* ===================== INIT ===================== */
  useEffect(() => {
    if (isManualAddressLocked()) {
      enforceManualModeLock()
      setLoading(false)
      return
    }

    // Load stored location first for IMMEDIATE display (no loading state)
    const stored = localStorage.getItem("userLocation")
    let shouldForceRefresh = false
    let hasInitialLocation = false

    if (stored) {
      try {
        const parsedLocation = JSON.parse(stored)

        // Show cached location immediately (even if incomplete) - better UX
        // We'll refresh in background but user sees something right away
        // BUT: Skip if it's just placeholder values ("Select location" or "Current Location")
        if (parsedLocation &&
          (parsedLocation.latitude || parsedLocation.city) &&
          parsedLocation.formattedAddress !== "Select location" &&
          parsedLocation.city !== "Current Location") {
          setLocation(parsedLocation)
          setPermissionGranted(true)
          setLoading(false) // Set loading to false immediately
          hasInitialLocation = true
          false && console.log("📂 Loaded stored location instantly:", parsedLocation)

          // Check if we should refresh in background for better address
          const hasCompleteAddress = parsedLocation?.formattedAddress &&
            parsedLocation.formattedAddress !== "Select location" &&
            !parsedLocation.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
            parsedLocation.formattedAddress.split(',').length >= 4

          if (!hasCompleteAddress) {
            false && console.log("⚠️ Cached location incomplete, will refresh in background")
            shouldForceRefresh = true
          }
        } else {
          false && console.log("⚠️ Cached location is placeholder, will fetch fresh")
          shouldForceRefresh = true
        }
      } catch (err) {
        console.error("Failed to parse stored location:", err)
        shouldForceRefresh = true
      }
    }

    // If no cached location, try DB
    if (!hasInitialLocation) {
      fetchLocationFromDB()
        .then((dbLoc) => {
          if (dbLoc && (dbLoc.latitude || dbLoc.city)) {
            setLocation(dbLoc)
            setPermissionGranted(true)
            setLoading(false)
            hasInitialLocation = true
            false && console.log("📂 Loaded location from DB:", dbLoc)

            // Check if we should refresh for better address
            const hasCompleteAddress = dbLoc?.formattedAddress &&
              dbLoc.formattedAddress !== "Select location" &&
              !dbLoc.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
              dbLoc.formattedAddress.split(',').length >= 4

            if (!hasCompleteAddress) {
              shouldForceRefresh = true
            }
          } else {
            // No location found - set loading to false and show fallback
            setLoading(false)
            shouldForceRefresh = true
          }
        })
        .catch(() => {
          setLoading(false)
          shouldForceRefresh = true
        })
    }

    // Always ensure loading is false after initial check
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          false && console.warn("⚠️ Loading timeout - setting loading to false")
          // Only set fallback if we still don't have a location
          setLocation((currentLocation) => {
            if (!currentLocation ||
              (currentLocation.formattedAddress === "Select location" &&
                !currentLocation.latitude && !currentLocation.city)) {
              return {
                city: "Select location",
                address: "Select location",
                formattedAddress: "Select location"
              }
            }
            return currentLocation
          })
        }
        return false
      })
    }, 5000) // 5 second safety timeout (increased to allow background fetch to complete)

    // Don't set fallback immediately - wait for background fetch to complete
    // The background fetch will set the location, or we'll use the cached/DB location
    // Only set fallback if we have no location after all attempts

    // Request fresh location in BACKGROUND (non-blocking)
    // CRITICAL FIX: Only auto-request if permission is ALREADY granted
    // This prevents "Requests geolocation permission on page load" warning
    const checkPermissionAndStart = async () => {
      try {
        if (isManualAddressLocked()) {
          setLoading(false)
          stopWatchingLocation()
          return
        }

        let permissionGranted = false;

        if (navigator.permissions && navigator.permissions.query) {
          try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            if (result.state === 'granted') {
              permissionGranted = true;
            } else {
              false && console.log(`📍 Geolocation permission is '${result.state}' - Waiting for user action (avoiding prompt on load)`);
            }
          } catch (permErr) {
            false && console.warn("⚠️ Permission query failed:", permErr);
          }
        } else {
          // iOS WebView / in-app browsers may not expose Permissions API.
          // Fallback to direct geolocation flow so location features still work.
          permissionGranted = true;
          false && console.log("📍 Permissions API not available - using direct geolocation fallback");
        }

        // If permission NOT granted, and we don't have a specific user request (this is page load),
        // we should SKIP automatic fetching/watching to allow the user to choose when to enable it.
        // UNLESS we already have a valid initial location from localStorage/DB, in which case we might want to refresh?
        // Actually, even then, we shouldn't prompt.
        if (!permissionGranted) {
          // If we have an initial location, we are fine (it's displayed).
          // If we don't, we show "Select Location".
          // In either case, we avoid the PROMPT.
          // Ensure loading is false so UI doesn't hang
          setLoading(false);
          return;
        }

        false && console.log("🚀 Permission granted! Fetching/Watching location...", shouldForceRefresh ? "(FORCE REFRESH)" : "");

        // Always fetch fresh location if we don't have a valid one
        // Check current location state to see if it's a placeholder
        const currentLocation = location
        const hasPlaceholder = currentLocation &&
          (currentLocation.formattedAddress === "Select location" ||
            currentLocation.city === "Current Location")

        // When permission is already granted, refresh GPS once in background
        // so stale DB/localStorage coordinates do not keep showing far-away restaurants.
        const hasExistingCoords =
          Number.isFinite(Number(currentLocation?.latitude)) &&
          Number.isFinite(Number(currentLocation?.longitude))
        const shouldFetch = shouldForceRefresh || !hasInitialLocation || hasPlaceholder || hasExistingCoords
        const shouldUseFreshGps =
          shouldForceRefresh ||
          !hasInitialLocation ||
          hasPlaceholder ||
          hasExistingCoords

        if (shouldFetch) {
          false && console.log("🔄 Fetching location - shouldForceRefresh:", shouldForceRefresh, "hasInitialLocation:", hasInitialLocation, "hasPlaceholder:", hasPlaceholder)
          getLocation(true, shouldUseFreshGps) // forceFresh = true so GPS replaces stale DB/localStorage coords
            .then((location) => {
              if (location &&
                location.formattedAddress !== "Select location" &&
                location.city !== "Current Location") {
                false && console.log("✅ Fresh location fetched:", location)
                false && console.log("✅ Location details:", {
                  formattedAddress: location?.formattedAddress,
                  address: location?.address,
                  city: location?.city,
                  state: location?.state,
                  area: location?.area
                })
                // CRITICAL: Update state with fresh location so PageNavbar displays it
                setLocation(location)
                setPermissionGranted(true)
                // Start watching for live updates
                startWatchingLocation()
              } else {
                false && console.warn("⚠️ Location fetch returned placeholder, retrying...")
                // Retry after 2 seconds if we got placeholder
                setTimeout(() => {
                  getLocation(true, true)
                    .then((retryLocation) => {
                      if (retryLocation &&
                        retryLocation.formattedAddress !== "Select location" &&
                        retryLocation.city !== "Current Location") {
                        setLocation(retryLocation)
                        setPermissionGranted(true)
                        startWatchingLocation()
                      }
                    })
                    .catch(() => {
                      startWatchingLocation()
                    })
                }, 2000)
              }
            })
            .catch((err) => {
              false && console.warn("⚠️ Background location fetch failed (using cached):", err.message)
              // Still start watching in case permission is granted later
              startWatchingLocation()
            })
        } else {
          // We have a valid location, just start watching
          startWatchingLocation()
        }
      } catch (err) {
        console.error("Error in checkPermissionAndStart:", err);
        setLoading(false);
      }
    };

    // Safe to run on every load because this path checks permission state first
    // and avoids triggering a browser prompt for fresh visitors.
    checkPermissionAndStart();

    // Cleanup timeout and watcher
    return () => {
      clearTimeout(loadingTimeout)
      false && console.log("🧹 Cleaning up location watcher")
      stopWatchingLocation()
    }
  }, [])

  // Hard-stop GPS updates when manual address is selected.
  useEffect(() => {
    const handleManualModeChange = () => {
      if (isManualAddressLocked()) {
        enforceManualModeLock()
      }
    }

    window.addEventListener(DELIVERY_ADDRESS_EVENT, handleManualModeChange)
    return () => {
      window.removeEventListener(DELIVERY_ADDRESS_EVENT, handleManualModeChange)
    }
  }, [])

  // Allow other screens/components to push fresh GPS coordinates immediately
  // so zone detection and UI update in real time without waiting for watcher cycles.
  useEffect(() => {
    const handleExternalLocationUpdate = (event) => {
      if (isManualAddressLocked()) return

      const payload = event?.detail || {}
      const latitude = Number(payload?.latitude)
      const longitude = Number(payload?.longitude)

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

      const nextLocation = {
        ...payload,
        latitude,
        longitude,
      }

      prevLocationCoordsRef.current = { latitude, longitude }
      setLocation(nextLocation)
      setPermissionGranted(true)
      setLoading(false)
      setError(null)
    }

    window.addEventListener(USER_LOCATION_UPDATED_EVENT, handleExternalLocationUpdate)
    return () => {
      window.removeEventListener(USER_LOCATION_UPDATED_EVENT, handleExternalLocationUpdate)
    }
  }, [])

  const requestLocation = async () => {
    if (isManualAddressLocked()) {
      setLoading(false)
      return location || null
    }
    false && console.log("📍📍📍 User requested location update - clearing cache and fetching fresh")
    setLoading(true)
    setError(null)

    try {
      // Clear cached location to force fresh fetch
      localStorage.removeItem("userLocation")
      false && console.log("🗑️ Cleared cached location from localStorage")

      // Show loading, so pass showLoading = true
      // forceFresh = true, updateDB = true, showLoading = true
      // This ensures we get fresh GPS coordinates and reverse geocode with Google Maps
      const location = await getLocation(true, true, true)

      false && console.log("✅✅✅ Fresh location requested successfully:", location)
      false && console.log("✅✅✅ Complete Location details:", {
        formattedAddress: location?.formattedAddress,
        address: location?.address,
        city: location?.city,
        state: location?.state,
        area: location?.area,
        pointOfInterest: location?.pointOfInterest,
        premise: location?.premise,
        coordinates: location?.latitude && location?.longitude ?
          `${location.latitude.toFixed(8)}, ${location.longitude.toFixed(8)}` : "N/A",
        hasCompleteAddress: location?.formattedAddress &&
          location.formattedAddress !== "Select location" &&
          !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) &&
          location.formattedAddress.split(',').length >= 4
      })

      // Verify we got complete address (POI, building, floor, area, city, state, pincode)
      if (!location?.formattedAddress ||
        location.formattedAddress === "Select location" ||
        location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/) ||
        location.formattedAddress.split(',').length < 4) {
        false && console.warn("⚠️⚠️⚠️ Location received but address is incomplete!")
        false && console.warn("⚠️ Address parts count:", location?.formattedAddress?.split(',').length || 0)
        false && console.warn("⚠️ This might be due to:")
        false && console.warn("   1. Google Maps API not enabled or billing not set up")
        false && console.warn("   2. Location permission not granted")
        false && console.warn("   3. GPS accuracy too low (try on mobile device)")
      } else {
        false && console.log("✅✅✅ SUCCESS: Complete detailed address received!")
        false && console.log("✅ Full address:", location.formattedAddress)
      }

      // Restart watching for live updates
      startWatchingLocation()

      return location
    } catch (err) {
      console.error("❌ Failed to request location:", err)
      setError(err.message || "Failed to get location")
      // Still try to start watching in case it works
      startWatchingLocation()
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    location,
    loading,
    error,
    permissionGranted,
    requestLocation,
    startWatchingLocation,
    stopWatchingLocation,
    reverseGeocode: reverseGeocodeWithGoogleMaps,
    geocode: async (address) => {
      try {
        const response = await locationAPI.geocode(address);
        if (response?.data?.success) {
          return response.data.data;
        }
        throw new Error(response?.data?.message || "Geocoding failed");
      } catch (err) {
        console.error("Geocoding hook error:", err);
        throw err;
      }
    }
  }
}
