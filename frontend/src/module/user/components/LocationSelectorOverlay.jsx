import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom"
import { ChevronLeft, Search, ChevronRight, Plus, MapPin, MoreHorizontal, Navigation, Home, Building2, Briefcase, Phone, X, Crosshair, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useLocation as useGeoLocation } from "../hooks/useLocation"
import { useProfile } from "../context/ProfileContext"
import { toast } from "sonner"
import { userAPI } from "@/lib/api"
import { Loader } from '@googlemaps/js-api-loader'
import { setSelectedDeliveryAddress } from "../utils/deliveryAddress"

const USER_LOCATION_UPDATED_EVENT = "user-location-updated"

const searchCache = new Map()

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

export default function LocationSelectorOverlay({ isOpen, onClose }) {
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()

  const pathname = routerLocation?.pathname || "/"
  const isCartPath =
    pathname === "/cart" ||
    pathname === "/user/cart" ||
    pathname === "/usermain/cart" ||
    pathname.startsWith("/cart/") ||
    pathname.startsWith("/user/cart/") ||
    pathname.startsWith("/usermain/cart/")
  const inputRef = useRef(null)
  const [searchValue, setSearchValue] = useState("")
  const { location, reverseGeocode, updateLocationInDB } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, userProfile, setDefaultAddress } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    label: "Home",
    phone: "",
  })
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)
  const [isRequestingCurrentLocation, setIsRequestingCurrentLocation] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const [loadingSavedAddresses, setLoadingSavedAddresses] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const greenMarkerRef = useRef(null) // Green marker for address selection
  const blueDotCircleRef = useRef(null) // Blue dot circle for Google Maps
  const userLocationMarkerRef = useRef(null) // Blue dot marker for user location
  const userLocationAccuracyCircleRef = useRef(null) // Accuracy circle for MapLibre/Mapbox
  const watchPositionIdRef = useRef(null) // Geolocation watchPosition ID
  const lastUserLocationRef = useRef(null) // Last user location for tracking
  const locationUpdateTimeoutRef = useRef(null) // Timeout for location updates
  const [currentAddress, setCurrentAddress] = useState("")
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)

  // Load Google Maps API key from backend
  useEffect(() => {
    import('@/lib/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])
  const reverseGeocodeTimeoutRef = useRef(null) // Debounce timeout for reverse geocoding
  const lastReverseGeocodeCoordsRef = useRef(null) // Track last coordinates to avoid duplicate calls
  const ltrInputStyle = { direction: "ltr", unicodeBidi: "plaintext", textAlign: "left" }
  const isGettingLocationRef = useRef(false)
  const sanitizeAddressText = (value) => {
    const rawParts = String(value || "")
      .split(",")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean)

    const exactValues = new Set(rawParts.map((part) => part.toLowerCase()))
    const filteredCityDupes = rawParts.filter((part) => {
      const lower = part.toLowerCase()
      if (!lower.endsWith(" city")) return true
      const base = lower.replace(/\s+city$/, "").trim()
      return !exactValues.has(base)
    })

    const seen = new Set()
    return filteredCityDupes
      .filter((part) => {
        const key = part.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .join(", ")
  }

  const getCurrentGpsCoordinates = (options = {}) =>
    new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error("Location services are not supported"))
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          ...options,
        },
      )
    })

  const getBestGpsCoordinates = ({
    sampleWindowMs = 12000,
    requiredAccuracy = 80,
  } = {}) =>
    new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error("Location services are not supported"))
        return
      }

      let watchId = null
      let sampleTimer = null
      let bestPosition = null

      const finalize = (position, error) => {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId)
          watchId = null
        }
        if (sampleTimer) {
          clearTimeout(sampleTimer)
          sampleTimer = null
        }

        if (position) {
          resolve(position)
          return
        }

        reject(error || new Error("Unable to get GPS fix"))
      }

      sampleTimer = setTimeout(() => {
        if (bestPosition) {
          finalize(bestPosition)
          return
        }
        finalize(null, new Error("GPS timeout"))
      }, sampleWindowMs)

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const nextAccuracy = Number(position?.coords?.accuracy || Infinity)
          const bestAccuracy = Number(bestPosition?.coords?.accuracy || Infinity)

          if (!bestPosition || nextAccuracy < bestAccuracy) {
            bestPosition = position
          }

          if (Number.isFinite(nextAccuracy) && nextAccuracy <= requiredAccuracy) {
            finalize(position)
          }
        },
        (error) => {
          if (error?.code === 1) {
            finalize(null, error)
            return
          }

          if (bestPosition) {
            finalize(bestPosition)
            return
          }

          finalize(null, error)
        },
        {
          enableHighAccuracy: true,
          timeout: sampleWindowMs,
          maximumAge: 0,
        },
      )
    })

  const getCurrentGpsCoordinatesWithRetry = async ({ forceLive = true } = {}) => {
    if (isGettingLocationRef.current) {
      console.log("📍 Location request already in progress, skipping...")
      return null
    }

    try {
      isGettingLocationRef.current = true
      // Try with strict GPS but with a faster timeout for better UX.
      const initialTimeout = forceLive ? 8000 : 6000;

      console.log(`📍 Requesting GPS (forceLive: ${forceLive}, timeout: ${initialTimeout}ms)`)
      
      try {
        const strictPosition = await getCurrentGpsCoordinates({
          enableHighAccuracy: true,
          timeout: initialTimeout,
          maximumAge: forceLive ? 0 : 30000,
        })

        const strictAccuracy = Number(strictPosition?.coords?.accuracy || Infinity)
        // If accuracy is good enough, return immediately
        if (Number.isFinite(strictAccuracy) && strictAccuracy <= 100) {
          return strictPosition
        }

        // If accuracy is poor, try to refine for a very short window
        toast.loading("Refining your location for accuracy...", { id: "current-location" })
        const refinedPosition = await getBestGpsCoordinates({
          sampleWindowMs: 4000,
          requiredAccuracy: 50,
        })
        toast.dismiss("current-location")
        return refinedPosition || strictPosition
      } catch (err) {
        // Fallback to low accuracy (network-based) if high accuracy fails
        console.warn("📍 High accuracy GPS failed, falling back to network location:", err.message)
        
        if (err.code === 1) throw err; // Permission denied - don't retry

        toast.loading("Getting approximate location...", { id: "current-location" })
        return await getCurrentGpsCoordinates({
          enableHighAccuracy: false, // Network based - much faster
          timeout: 8000,
          maximumAge: 60000,
        })
      }
    } catch (error) {
      console.error("❌ All GPS attempts failed:", error)
      throw error
    } finally {
      isGettingLocationRef.current = false
      toast.dismiss("current-location")
    }
  }

  // Debug: Log API key status (only first few characters for security)
  useEffect(() => {
    if (GOOGLE_MAPS_API_KEY) {
      console.log("✅ Google Maps API Key loaded:", GOOGLE_MAPS_API_KEY.substring(0, 10) + "...")
    } else {
      console.warn("⚠️ Google Maps API Key NOT found! Please set it in ENV Setup.")
    }
  }, [GOOGLE_MAPS_API_KEY])

  // Current location display - Show complete formatted address (SAVED ADDRESSES FORMAT)
  const currentLocationText = (() => {
    if (currentAddress &&
      currentAddress !== "Select location" &&
      !currentAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      let fullAddress = currentAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return fullAddress
    }

    if (addressFormData.additionalDetails &&
      addressFormData.additionalDetails !== "Select location" &&
      addressFormData.additionalDetails.trim() !== "") {
      let fullAddress = addressFormData.additionalDetails
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      const addressParts = [fullAddress]
      if (addressFormData.city) addressParts.push(addressFormData.city)
      if (addressFormData.state) {
        if (addressFormData.zipCode) {
          addressParts.push(`${addressFormData.state} ${addressFormData.zipCode}`)
        } else {
          addressParts.push(addressFormData.state)
        }
      } else if (addressFormData.zipCode) {
        addressParts.push(addressFormData.zipCode)
      }
      return addressParts.join(', ')
    }

    if (location?.formattedAddress &&
      location.formattedAddress !== "Select location" &&
      !location.formattedAddress.match(/^-?\d+\.\d+,\s*-?\d+\.\d+$/)) {
      let fullAddress = location.formattedAddress
      if (fullAddress.endsWith(', India')) {
        fullAddress = fullAddress.replace(', India', '').trim()
      }
      return fullAddress
    }

    // Final fallback: Use city/area combine
    const mainPart = location?.area && location.area !== "Location Found" 
      ? location.area 
      : (location?.city && location.city !== "Unknown City" && location.city !== "Current Location" ? location.city : "");
    
    if (mainPart) {
      if (location?.city && location.city !== mainPart && location.city !== "Unknown City") {
        return `${mainPart}, ${location.city}`
      }
      return mainPart
    }

    return "Detecting location..."
  })()

  // Global error suppression for Ola Maps SDK errors
  useEffect(() => {
    const originalConsoleError = console.error
    const errorSuppressor = (...args) => {
      const errorStr = args.join(' ')
      if (errorStr.includes('AbortError') ||
        errorStr.includes('user aborted') ||
        errorStr.includes('sprite@2x.json') ||
        errorStr.includes('3d_model') ||
        (errorStr.includes('Source layer') && errorStr.includes('does not exist')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('sprite')) ||
        (errorStr.includes('AJAXError') && errorStr.includes('olamaps.io'))) {
        return
      }
      originalConsoleError.apply(console, args)
    }

    console.error = errorSuppressor

    const unhandledRejectionHandler = (event) => {
      const error = event.reason || event
      const errorMsg = error?.message || String(error) || ''
      if (errorMsg.includes('AbortError') ||
        errorMsg.includes('user aborted') ||
        errorMsg.includes('3d_model') ||
        (errorMsg.includes('Source layer') && errorMsg.includes('does not exist')) ||
        (errorMsg.includes('AJAXError') && (errorMsg.includes('sprite') || errorMsg.includes('olamaps.io')))) {
        event.preventDefault()
        return
      }
    }

    window.addEventListener('unhandledrejection', unhandledRejectionHandler)
    return () => {
      console.error = originalConsoleError
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
    }
  }, [])

  // Update blue dot indicator
  useEffect(() => {
    if (location?.latitude && location?.longitude && googleMapRef.current && window.google && window.google.maps) {
      const userPos = { lat: location.latitude, lng: location.longitude }
      const accuracyRadius = Math.max(location.accuracy || 50, 20)

      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.setPosition(userPos)
        if (userLocationMarkerRef.current.getMap() !== googleMapRef.current) {
          userLocationMarkerRef.current.setMap(googleMapRef.current)
        }
      } else {
        userLocationMarkerRef.current = new window.google.maps.Marker({
          position: userPos,
          map: googleMapRef.current,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "#FFFFFF",
            strokeWeight: 3,
          },
          zIndex: window.google.maps.Marker.MAX_ZINDEX + 1,
          optimized: false
        })
      }

      if (blueDotCircleRef.current) {
        blueDotCircleRef.current.setCenter(userPos)
        blueDotCircleRef.current.setRadius(accuracyRadius)
      } else {
        blueDotCircleRef.current = new window.google.maps.Circle({
          strokeColor: "#4285F4",
          strokeOpacity: 0.4,
          strokeWeight: 1,
          fillColor: "#4285F4",
          fillOpacity: 0.15,
          map: googleMapRef.current,
          center: userPos,
          radius: accuracyRadius,
          zIndex: window.google.maps.Marker.MAX_ZINDEX
        })
      }
    }
  }, [location?.latitude, location?.longitude, location?.accuracy])

  // Initialize Map
  useEffect(() => {
    if (!showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const initializeGoogleMap = async () => {
      try {
        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
          libraries: ["places", "geocoding"]
        })

        const google = await loader.load()
        if (!isMounted || !mapContainerRef.current) return

        const initialLocation = location?.latitude && location?.longitude
          ? { lat: location.latitude, lng: location.longitude }
          : { lat: 22.7196, lng: 75.8577 }

        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialLocation,
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true
        })

        googleMapRef.current = map

        const greenMarker = new google.maps.Marker({
          position: initialLocation,
          map: map,
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
            scaledSize: new google.maps.Size(40, 40),
            anchor: new google.maps.Point(20, 40)
          },
          draggable: true
        })

        greenMarkerRef.current = greenMarker

        google.maps.event.addListener(greenMarker, 'dragend', function () {
          const newPos = greenMarker.getPosition()
          const newLat = newPos.lat()
          const newLng = newPos.lng()
          setMapPosition([newLat, newLng])
          handleMapMoveEnd(newLat, newLng)
        })

        google.maps.event.addListenerOnce(map, 'idle', () => {
          handleMapMoveEnd(initialLocation.lat, initialLocation.lng)
          setMapLoading(false)
        })

      } catch (error) {
        console.error("Error initializing Google Maps:", error)
        setMapLoading(false)
        toast.error("Failed to load map")
      }
    }

    initializeGoogleMap()
    return () => { isMounted = false }
  }, [showAddressForm, GOOGLE_MAPS_API_KEY])

  // Pause live GPS updates while pinning/selecting to prevent "jumping" back to current location
  useEffect(() => {
    if (showAddressForm && isOpen) {
      sessionStorage.setItem("__location_selecting_active", "true")
    } else {
      sessionStorage.removeItem("__location_selecting_active")
    }
    return () => sessionStorage.removeItem("__location_selecting_active")
  }, [showAddressForm, isOpen])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleUseCurrentLocation = async () => {
    if (isRequestingCurrentLocation) return
    try {
      setIsRequestingCurrentLocation(true)
      toast.loading("Detecting your location...", { id: "location-request" })
      
      const position = await getCurrentGpsCoordinatesWithRetry({ forceLive: true })
      if (!position) {
        toast.dismiss("location-request")
        return
      }
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude
      const accuracy = position.coords.accuracy

      const geocoded = await reverseGeocode(latitude, longitude)
      const gpsLocationData = {
        latitude,
        longitude,
        accuracy,
        address: geocoded.address || "",
        city: geocoded.city || "",
        state: geocoded.state || "",
        area: geocoded.area || "",
        formattedAddress: geocoded.formattedAddress || "",
      }

      localStorage.setItem("userLocation", JSON.stringify(gpsLocationData))
      window.dispatchEvent(new CustomEvent(USER_LOCATION_UPDATED_EVENT, { detail: gpsLocationData }))
      
      await updateLocationInDB(gpsLocationData)
      setSelectedDeliveryAddress({ mode: "current" })

      toast.success("Location updated!", { id: "location-request" })
      setTimeout(() => {
        onClose()
        if (!isCartPath) navigate("/")
      }, 1200)
    } catch (error) {
      console.error("Location error:", error)
      toast.error("Failed to get location", { id: "location-request" })
    } finally {
      setIsRequestingCurrentLocation(false)
      toast.dismiss("current-location")
    }
  }

  const handleAddAddress = () => {
    setEditingAddressId(null)
    setShowAddressForm(true)
    if (location?.latitude && location?.longitude) {
      setMapPosition([location.latitude, location.longitude])
      setAddressFormData(prev => ({
        ...prev,
        city: location.city || "",
        state: location.state || "",
        street: location.address || location.area || "",
        phone: userProfile?.phone || "",
      }))
    }
  }

  const handleAddressFormChange = (e) => {
    const { name, value } = e.target
    if (name === "zipCode") {
      const nextZip = String(value || "").replace(/\D/g, "").slice(0, 6)
      setAddressFormData(prev => ({ ...prev, zipCode: nextZip }))
      return
    }
    setAddressFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleMapMoveEnd = async (lat, lng, knownAddress = null) => {
    const roundedLat = parseFloat(lat.toFixed(6))
    const roundedLng = parseFloat(lng.toFixed(6))

    if (lastReverseGeocodeCoordsRef.current?.lat === roundedLat && 
        lastReverseGeocodeCoordsRef.current?.lng === roundedLng) return

    if (reverseGeocodeTimeoutRef.current) clearTimeout(reverseGeocodeTimeoutRef.current)

    reverseGeocodeTimeoutRef.current = setTimeout(async () => {
      lastReverseGeocodeCoordsRef.current = { lat: roundedLat, lng: roundedLng }
      setLoadingAddress(true)
      try {
        if (knownAddress) {
          setCurrentAddress(knownAddress)
          setAddressFormData(prev => ({ ...prev, additionalDetails: knownAddress }))
          setLoadingAddress(false)
          return
        }

        const addr = await reverseGeocode(roundedLat, roundedLng)
        const safeFormattedAddress = sanitizeAddressText(addr.formattedAddress)
        
        setCurrentAddress(safeFormattedAddress || "Select location")
        setAddressFormData(prev => ({
          ...prev,
          street: addr.street || prev.street,
          city: addr.city || prev.city,
          state: addr.state || prev.state,
          zipCode: addr.postalCode || prev.zipCode,
          additionalDetails: safeFormattedAddress || prev.additionalDetails,
        }))
      } catch (error) {
        console.error("Reverse geocoding error:", error)
      } finally {
        setLoadingAddress(false)
      }
    }, 300)
  }

  const handleUseCurrentLocationForAddress = async () => {
    try {
      toast.loading("Getting location...", { id: "current-location" })
      const position = await getCurrentGpsCoordinatesWithRetry({ forceLive: true })
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      
      setMapPosition([lat, lng])
      if (googleMapRef.current) {
        googleMapRef.current.panTo({ lat, lng })
        googleMapRef.current.setZoom(17)
      }
      if (greenMarkerRef.current) greenMarkerRef.current.setPosition({ lat, lng })

      await handleMapMoveEnd(lat, lng)
      toast.success("Location detected!", { id: "current-location" })
    } catch (error) {
      toast.error("Location unavailable", { id: "current-location" })
    }
  }

  const handleAddressFormSubmit = async (e) => {
    e.preventDefault()
    if (!mapPosition?.[0]) return toast.error("Select location on map")

    setIsSavingAddress(true)
    try {
      const addressToSave = {
        label: addressFormData.label || "Home",
        street: addressFormData.street || "",
        additionalDetails: addressFormData.additionalDetails || "",
        city: addressFormData.city || location?.city || "",
        state: addressFormData.state || location?.state || "",
        zipCode: addressFormData.zipCode || "",
        latitude: mapPosition[0],
        longitude: mapPosition[1],
        isDefault: true,
      }

      let result = editingAddressId 
        ? await updateAddress(editingAddressId, addressToSave)
        : await addAddress(addressToSave)

      const savedId = result?.id || result?._id
      if (savedId) {
        setSelectedDeliveryAddress({ mode: "saved", addressId: savedId })
        setDefaultAddress(savedId)
      }

      toast.success("Address saved!")
      setShowAddressForm(false)
      if (isCartPath) onClose()
    } catch (error) {
      toast.error("Failed to save address")
    } finally {
      setIsSavingAddress(false)
    }
  }

  const handleSearchLocation = async (query) => {
    if (!query || !googleMapRef.current) return
    setMapLoading(true)
    try {
      const service = new window.google.maps.places.PlacesService(googleMapRef.current)
      service.findPlaceFromQuery({
        query: query.trim(),
        fields: ["geometry", "formatted_address", "name"],
      }, (results, status) => {
        if (status === "OK" && results?.[0]) {
          const place = results[0]
          const lat = place.geometry.location.lat()
          const lng = place.geometry.location.lng()
          applySearchResult(lat, lng, place)
        } else {
          setMapLoading(false)
          toast.error("Location not found")
        }
      })
    } catch (err) {
      setMapLoading(false)
    }
  }

  const applySearchResult = (lat, lng, place) => {
    setMapPosition([lat, lng])
    if (googleMapRef.current) {
      googleMapRef.current.panTo({ lat, lng })
      googleMapRef.current.setZoom(17)
    }
    if (greenMarkerRef.current) greenMarkerRef.current.setPosition({ lat, lng })

    setAddressFormData(prev => ({
      ...prev,
      street: place.name || prev.street,
      additionalDetails: place.formatted_address || prev.additionalDetails
    }))
    
    handleMapMoveEnd(lat, lng, place.formatted_address)
    setMapLoading(false)
  }

  const handleEditAddress = (e, address) => {
    e.stopPropagation()
    setEditingAddressId(address.id || address._id)
    setAddressFormData({
      street: address.street || "",
      city: address.city || "",
      state: address.state || "",
      zipCode: address.zipCode || "",
      additionalDetails: address.additionalDetails || "",
      label: address.label || "Home",
      phone: address.phone || "",
    })
    setMapPosition([address.latitude, address.longitude])
    setShowAddressForm(true)
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setEditingAddressId(null)
    if (!isCartPath) navigate("/")
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const lat = address.location?.coordinates?.[1] ?? address.latitude
      const lng = address.location?.coordinates?.[0] ?? address.longitude
      
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        latitude: lat,
        longitude: lng,
        formattedAddress: `${address.street}, ${address.city}, ${address.state}`
      }

      localStorage.setItem("userLocation", JSON.stringify(locationData))
      window.dispatchEvent(new CustomEvent(USER_LOCATION_UPDATED_EVENT, { detail: locationData }))
      
      const savedId = address.id || address._id
      if (savedId) {
        await updateAddress(savedId, { isDefault: true })
        setDefaultAddress(savedId)
        setSelectedDeliveryAddress({ mode: "saved", addressId: savedId })
      }

      toast.success("Location updated!")
      onClose()
      if (!isCartPath) navigate("/")
    } catch (error) {
      toast.error("Failed to select address")
    }
  }

  const deliveryDetailsText = (() => {
    const val = addressFormData.additionalDetails || currentAddress
    return val === "Select location" ? "Select location on map" : val
  })()

  if (!isOpen) return null

  if (showAddressForm) {
    return (
      <div className="fixed inset-0 z-[10000] bg-white dark:bg-[#0a0a0a] flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden">
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
              <X className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            </Button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Delivery location</h1>
          </div>
        </div>

        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-orange-600 z-10" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchLocation(searchValue)}
              placeholder="Search area, street..."
              className="pl-12 h-12 w-full bg-gray-50 dark:bg-[#2a2a2a] rounded-xl text-neutral-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-shrink-0 relative" style={{ height: '35vh' }}>
          <div ref={mapContainerRef} className="w-full h-full bg-gray-200" />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <Button onClick={handleUseCurrentLocationForAddress} className="bg-white dark:bg-[#1a1a1a] text-orange-600 border-2 border-orange-600 hover:bg-orange-50 shadow-lg px-4 flex items-center gap-2">
              <Crosshair className="h-4 w-4" />
              <span>Current location</span>
            </Button>
          </div>
          {mapLoading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Delivery details</Label>
            <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-orange-600" />
              <p className="text-sm text-gray-900 dark:text-white truncate">{deliveryDetailsText}</p>
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Address details*</Label>
            <Input
              name="additionalDetails"
              placeholder="Floor, House no."
              value={addressFormData.additionalDetails}
              onChange={handleAddressFormChange}
              className="text-neutral-900 dark:text-white"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Save as</Label>
            <div className="flex gap-2">
              {["Home", "Office", "Other"].map((label) => (
                <Button
                  key={label}
                  onClick={() => setAddressFormData(prev => ({ ...prev, label }))}
                  variant={addressFormData.label === label ? "default" : "outline"}
                  className={`flex-1 ${addressFormData.label === label ? "bg-orange-600 text-white" : ""}`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Input name="street" placeholder="Street / Area *" value={addressFormData.street} onChange={handleAddressFormChange} className="text-neutral-900 dark:text-white" />
            <div className="grid grid-cols-2 gap-2">
              <Input name="city" placeholder="City *" value={addressFormData.city} onChange={handleAddressFormChange} className="text-neutral-900 dark:text-white" />
              <Input name="state" placeholder="State *" value={addressFormData.state} onChange={handleAddressFormChange} className="text-neutral-900 dark:text-white" />
            </div>
            <Input name="zipCode" placeholder="Pincode" value={addressFormData.zipCode} onChange={handleAddressFormChange} className="text-neutral-900 dark:text-white" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#1a1a1a] border-t">
          <Button onClick={handleAddressFormSubmit} disabled={isSavingAddress} className="w-full bg-orange-600 text-white h-12 rounded-xl text-lg font-bold">
            {isSavingAddress ? "Saving..." : "Save and Proceed"}
          </Button>
        </div>
      </div>
    )
  }

  const filteredSavedAddresses = addresses.filter(addr => {
    const q = searchValue.toLowerCase()
    return !q || [addr.label, addr.street, addr.city].some(s => s?.toLowerCase().includes(q))
  })

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col pointer-events-none overscroll-none">
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={onClose} />
      
      <div className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white dark:bg-[#0a0a0a] rounded-t-[32px] overflow-hidden flex flex-col pointer-events-auto shadow-2xl">
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full" />
        </div>

        <div className="px-6 py-5 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Select location</h2>
            <p className="text-sm text-gray-500 mt-1">Where should we deliver?</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-6 w-6 text-gray-400" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto pb-8 custom-scrollbar">
          <div className="px-6 mb-6">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-orange-600 transition-colors" />
              <Input
                placeholder="Search area, street name..."
                className="pl-12 h-14 bg-gray-50 dark:bg-[#1a1a1a] border-gray-100 rounded-2xl text-lg text-neutral-900 dark:text-white"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (handleSearchLocation(searchValue), setShowAddressForm(true))}
              />
            </div>
          </div>

          <div className="px-6 mb-8">
            <Button
              variant="outline"
              onClick={handleUseCurrentLocation}
              disabled={isRequestingCurrentLocation}
              className="w-full h-16 flex items-center gap-4 bg-white dark:bg-gray-900 border-gray-200 rounded-2xl p-4 text-left group"
            >
              <div className="h-10 w-10 rounded-full bg-orange-50 flex items-center justify-center">
                <Crosshair className="h-5 w-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-orange-600">Use current location</p>
                <p className="text-xs text-gray-400">{isRequestingCurrentLocation ? "Detecting..." : "Using GPS for accuracy"}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </Button>
          </div>

          <div className="px-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saved Addresses</h3>
              <Button variant="ghost" size="sm" className="text-orange-600 font-bold" onClick={() => setShowAddressForm(true)}>+ ADD NEW</Button>
            </div>
            
            <div className="space-y-4">
              {filteredSavedAddresses.length > 0 ? (
                filteredSavedAddresses.map((addr) => {
                  const Icon = getAddressIcon(addr)
                  return (
                    <div
                      key={addr.id || addr._id}
                      onClick={() => handleSelectSavedAddress(addr)}
                      className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl cursor-pointer transition-colors"
                    >
                      <div className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white">{addr.label}</p>
                        <p className="text-sm text-gray-500 truncate">{addr.additionalDetails}, {addr.street}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => handleEditAddress(e, addr)} className="text-orange-600">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })
              ) : (
                <div className="py-8 text-center text-gray-400">No saved addresses found</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
