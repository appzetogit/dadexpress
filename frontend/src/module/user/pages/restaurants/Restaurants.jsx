import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { ArrowLeft, Clock, MapPin, Heart, Star } from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import Footer from "../../components/Footer"
import ScrollReveal from "../../components/ScrollReveal"
import TextReveal from "../../components/TextReveal"
import { Card, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useProfile } from "../../context/ProfileContext"
import { restaurantAPI, zoneAPI } from "@/lib/api"
import { useLocation } from "../../hooks/useLocation"
import { useZone } from "../../hooks/useZone"
import { useSelectedDeliveryAddress } from "../../hooks/useSelectedDeliveryAddress"
import { resolveActiveLocation, resolveDeliveryAddress } from "../../utils/deliveryAddress"

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getAddressCoords = (address) => {
  if (!address) return null
  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : null
  let lng = toNumber(coordinates?.[0] ?? address.longitude ?? address.lng)
  let lat = toNumber(coordinates?.[1] ?? address.latitude ?? address.lat)
  if (!lat || !lng) return null
  const latValid = Math.abs(lat) <= 90
  const lngValid = Math.abs(lng) <= 180
  if (!latValid && Math.abs(lng) <= 90 && Math.abs(lat) <= 180) {
    const swappedLat = lng
    const swappedLng = lat
    lat = swappedLat
    lng = swappedLng
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

const getAddressZoneId = (address) => (
  address?.zoneId ||
  address?.zone?._id ||
  address?.zone?.id ||
  null
)

const getAddressSearchQuery = (address) => {
  if (!address) return ""
  return [
    address.formattedAddress,
    address.address,
    address.street,
    address.area,
    address.city,
    address.state,
    address.zipCode,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(", ")
}

const geocodeAddressCoords = async (address) => {
  const query = getAddressSearchQuery(address)
  if (!query) return null
  if (
    typeof window === "undefined" ||
    !window.google?.maps?.Geocoder
  ) {
    return null
  }

  const geocoder = new window.google.maps.Geocoder()
  try {
    const geocodeResult = await geocoder.geocode({ address: query })
    const result = geocodeResult?.results?.[0]
    const location = result?.geometry?.location
    const lat = typeof location?.lat === "function" ? toNumber(location.lat()) : null
    const lng = typeof location?.lng === "function" ? toNumber(location.lng()) : null
    if (!lat || !lng) return null
    return { lat, lng }
  } catch (error) {
    console.error("Address geocoding failed:", error)
    return null
  }
}

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [emptyMessage, setEmptyMessage] = useState("No restaurants available in this area")
  const [dietaryFilter, setDietaryFilter] = useState("all")
  const { addFavorite, removeFavorite, isFavorite, addresses = [], getDefaultAddress, loading: profileLoading } = useProfile()
  const { selectedDeliveryAddress } = useSelectedDeliveryAddress()
  const { location } = useLocation()
  const isSavedSelectionLocked = selectedDeliveryAddress?.mode === "saved"
  const isManualMode = selectedDeliveryAddress?.mode === "saved"
  const { zoneId: currentZoneId, loading: zoneLoading } = useZone(
    isSavedSelectionLocked ? null : location,
  )
  const defaultAddress = useMemo(
    () => (typeof getDefaultAddress === "function" ? getDefaultAddress() : null),
    [getDefaultAddress, addresses],
  )
  const resolvedDeliveryAddress = useMemo(
    () =>
      resolveDeliveryAddress({
        selected: selectedDeliveryAddress,
        addresses,
        currentLocation: location,
        fallbackAddress: defaultAddress,
      }),
    [selectedDeliveryAddress, addresses, location, defaultAddress],
  )
  const selectedAddress = resolvedDeliveryAddress?.address || null
  const currentLocation = location || null
  const selectedCoords = resolvedDeliveryAddress?.coords || getAddressCoords(selectedAddress)
  const [resolvedZoneId, setResolvedZoneId] = useState(null)
  const [resolvedZoneSource, setResolvedZoneSource] = useState(null) // "manual" | "gps" | null
  const [resolvedSelectedCoords, setResolvedSelectedCoords] = useState(null)
  const [isZoneResolving, setIsZoneResolving] = useState(false)
  const zoneResolveRequestRef = useRef(0)
  const restaurantsRequestRef = useRef(0)
  const activeLocation = useMemo(
    () =>
      resolveActiveLocation({
        selectedAddress,
        currentLocation: !isManualMode && currentLocation
          ? {
            ...currentLocation,
            zoneId: currentZoneId || currentLocation.zoneId || null,
          }
          : null,
      }),
    [selectedAddress, currentLocation, currentZoneId, isManualMode],
  )

  useEffect(() => {
    if (profileLoading) return
    let cancelled = false
    const resolveRequestId = ++zoneResolveRequestRef.current

    const resolveZone = async () => {
      const hasSelectedAddress = Boolean(selectedAddress)
      let selectedLocationCoords = selectedCoords
      const hasSelectedCoords = Boolean(selectedLocationCoords?.lat && selectedLocationCoords?.lng)

      if (isManualMode && !hasSelectedAddress) {
        if (cancelled || resolveRequestId !== zoneResolveRequestRef.current) return
        setResolvedZoneId(null)
        setResolvedZoneSource(null)
        setResolvedSelectedCoords(null)
        setIsZoneResolving(true)
        setError("")
        return
      }

      // id="sanity-check"
      if (selectedAddress) {
        console.log("📦 Stored Address:", selectedAddress)
      }

      console.log("[Restaurants][ZoneResolve]", {
        resolveRequestId,
        selectedDeliveryAddress,
        selectedAddress,
        currentLocation,
        activeLocation,
        isSavedSelectionLocked,
        zoneIdFromCurrentLocation: currentZoneId,
      })

      if (!hasSelectedAddress) {
        if (cancelled || resolveRequestId !== zoneResolveRequestRef.current) return
        setResolvedZoneId(currentZoneId || null)
        setResolvedZoneSource("gps")
        setResolvedSelectedCoords(null)
        setIsZoneResolving(false)
        setError("")
        return
      }

      setIsZoneResolving(true)
      let zoneId = getAddressZoneId(selectedAddress)

      if (!zoneId && !hasSelectedCoords) {
        selectedLocationCoords = await geocodeAddressCoords(selectedAddress)
      }

      const hasResolvedCoords = Boolean(selectedLocationCoords?.lat && selectedLocationCoords?.lng)
      // id="addr-validate"
      if (selectedAddress) {
        if (!hasResolvedCoords) {
          console.error("❌ Invalid selectedAddress coordinates")
          if (cancelled || resolveRequestId !== zoneResolveRequestRef.current) return
          setResolvedZoneId(null)
          setResolvedSelectedCoords(null)
          setIsZoneResolving(false)
          setError("Service not available in this area")
          return
        }
        console.log("✅ Selected Address:", selectedAddress)
      }

      if (!zoneId && hasResolvedCoords) {
        try {
          // id="zone-test"
          const response = await zoneAPI.getZoneByCoordinates(
            selectedLocationCoords.lat,
            selectedLocationCoords.lng,
          )
          const derivedZoneId =
            response?.data?.data?.zoneId ||
            response?.data?.data?.zone?._id ||
            response?.zoneId ||
            null
          console.log("📍 Zone from API:", derivedZoneId)
          zoneId = derivedZoneId
        } catch (zoneError) {
          console.error("Zone fetch failed:", zoneError)
        }
      }

      // id="zone-lock"
      if (selectedAddress) {
        const derivedZoneId = zoneId || null
        const storedZoneId = getAddressZoneId(selectedAddress)
        if (derivedZoneId && storedZoneId && derivedZoneId !== storedZoneId) {
          console.error("❌ Zone mismatch detected", {
            storedZoneId,
            derivedZoneId,
          })
          zoneId = derivedZoneId
        } else if (storedZoneId && !derivedZoneId) {
          zoneId = storedZoneId
        }
      }

      if (cancelled || resolveRequestId !== zoneResolveRequestRef.current) return
      if (!zoneId) {
        setError("Service not available in this area")
      } else {
        setError("")
      }
      if (!cancelled && resolveRequestId === zoneResolveRequestRef.current) {
        setResolvedZoneId(zoneId || null)
        setResolvedZoneSource("manual")
        setResolvedSelectedCoords(zoneId ? (selectedLocationCoords || null) : null)
        setIsZoneResolving(false)
      }
    }

    resolveZone()
    return () => {
      cancelled = true
    }
  }, [
    selectedDeliveryAddress,
    isSavedSelectionLocked,
    selectedAddress,
    selectedCoords?.lat,
    selectedCoords?.lng,
    currentZoneId,
    currentLocation,
    activeLocation,
    isManualMode,
  ])

  useEffect(() => {
    const requestId = ++restaurantsRequestRef.current
    if (profileLoading || zoneLoading || isZoneResolving) {
      return
    }

    if (!resolvedZoneId) {
      setLoading(false)
      setRestaurants([])
      setError("Service not available in this area")
      setEmptyMessage("No restaurants available in this area")
      return
    }

    const fetchRestaurants = async () => {
      try {
        setLoading(true)
        setError("")

        if (!resolvedZoneId || isZoneResolving) {
          setRestaurants([])
          setLoading(false)
          return
        }
        if (isManualMode && resolvedZoneSource !== "manual") {
          setRestaurants([])
          setLoading(false)
          return
        }

        const params = {}
        params.zoneId = resolvedZoneId
        if (dietaryFilter && dietaryFilter !== "all") {
          params.dietary = dietaryFilter
        }

        const selectedAddressZoneId = getAddressZoneId(selectedAddress)
        if (selectedAddress && selectedAddressZoneId && selectedAddressZoneId !== params.zoneId) {
          console.error("❌ GPS OVERRIDE DETECTED", {
            selectedAddressZoneId,
            zoneIdUsed: params.zoneId,
          })
        }

        console.log("MODE:", selectedAddress ? "MANUAL" : "GPS")
        console.log("ZONE USED:", params.zoneId)
        console.log("ACTIVE LOCATION:", activeLocation)
        console.log("ZONE ID USED:", params.zoneId)
        console.log("[Restaurants][Fetch:start]", {
          requestId,
          selectedDeliveryAddress,
          selectedAddress,
          currentLocation,
          activeLocation,
          zoneIdUsed: params.zoneId,
        })

        const response = await restaurantAPI.getRestaurantsByZone(params.zoneId, params)
        if (requestId !== restaurantsRequestRef.current) {
          console.log("[Restaurants][Fetch:stale-response]", {
            requestId,
            activeRequestId: restaurantsRequestRef.current,
            aborted: true,
          })
          return
        }
        const restaurantsArray = response?.data?.data?.restaurants || []

        if (restaurantsArray.length === 0) {
          setRestaurants([])
          setEmptyMessage("No restaurants available in this area")
          return
        }

        const transformed = restaurantsArray.map((restaurant) => {
          const cuisine = restaurant.cuisines && restaurant.cuisines.length > 0
            ? restaurant.cuisines[0]
            : "Multi-cuisine"

          const coverImages = restaurant.coverImages && restaurant.coverImages.length > 0
            ? restaurant.coverImages.map((img) => img.url || img)
            : []
          const fallbackImages = restaurant.menuImages && restaurant.menuImages.length > 0
            ? restaurant.menuImages.map((img) => img.url || img)
            : []
          const image = coverImages[0] || fallbackImages[0] || restaurant.profileImage?.url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"

          return {
            id: restaurant.restaurantId || restaurant._id,
            slug: restaurant.slug || (restaurant.name || "").toLowerCase().replace(/\s+/g, "-"),
            name: restaurant.name || "Restaurant",
            cuisine,
            rating: restaurant.rating || 4.5,
            deliveryTime: restaurant.estimatedDeliveryTime || "N/A",
            distance: restaurant.distance || "N/A",
            image,
            priceRange: restaurant.priceRange || "$$",
            isActive: restaurant.isActive !== false,
            isAcceptingOrders: restaurant.isAcceptingOrders !== false,
          }
        })

        setRestaurants(transformed)
        console.log("[Restaurants][Fetch:done]", {
          requestId,
          zoneIdUsed: params.zoneId,
          count: transformed.length,
          aborted: requestId !== restaurantsRequestRef.current,
        })
      } catch (err) {
        if (requestId !== restaurantsRequestRef.current) return
        setError(err?.response?.data?.message || "Failed to load restaurants")
        setRestaurants([])
        setEmptyMessage("No restaurants available in this area")
      } finally {
        if (requestId !== restaurantsRequestRef.current) return
        setLoading(false)
      }
    }

    fetchRestaurants()
  }, [
    dietaryFilter,
    resolvedZoneId,
    resolvedZoneSource,
    isZoneResolving,
    zoneLoading,
    selectedDeliveryAddress,
    selectedAddress,
    currentLocation,
    activeLocation,
    resolvedSelectedCoords?.lat,
    resolvedSelectedCoords?.lng,
    isManualMode,
  ])

  useEffect(() => {
    setRestaurants([])
    setLoading(true)
  }, [resolvedZoneId, isSavedSelectionLocked])

  const content = useMemo(() => {
    if (loading) {
      return <p className="text-sm text-gray-600 dark:text-gray-400">Loading restaurants...</p>
    }

    if (error) {
      return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
    }

    if (restaurants.length === 0) {
      return <p className="text-sm text-gray-600 dark:text-gray-400">{emptyMessage}</p>
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 xl:gap-6 pt-2 sm:pt-3 lg:pt-4">
        {restaurants.map((restaurant, index) => {
          const restaurantSlug = restaurant.slug
          const isRestaurantOpen = restaurant.isActive && restaurant.isAcceptingOrders
          const favorite = isFavorite(restaurantSlug)

          const handleToggleFavorite = (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (favorite) {
              removeFavorite(restaurantSlug)
            } else {
              addFavorite({
                slug: restaurantSlug,
                name: restaurant.name,
                cuisine: restaurant.cuisine,
                rating: restaurant.rating,
                deliveryTime: restaurant.deliveryTime,
                distance: restaurant.distance,
                priceRange: restaurant.priceRange,
                image: restaurant.image,
              })
            }
          }

          return (
            <ScrollReveal key={restaurant.id} delay={index * 0.1}>
              {isRestaurantOpen ? (
                <Link to={`/restaurants/${restaurantSlug}`} className="h-full flex">
                  <Card className="overflow-hidden cursor-pointer border border-gray-200 dark:border-gray-800 group bg-white dark:bg-[#1a1a1a] hover:shadow-lg dark:hover:shadow-xl dark:hover:shadow-gray-900/50 pb-1 sm:pb-2 lg:pb-3 flex flex-col h-full w-full transition-all duration-300">
                    <div className="flex flex-row min-h-[120px] sm:min-h-[140px] md:min-h-[160px] lg:min-h-[180px] flex-1">
                      <CardContent className="flex-1 flex flex-col justify-between p-3 sm:p-4 md:p-5 lg:p-6 min-w-0 overflow-hidden">
                        <div className="flex-1 flex flex-col justify-between gap-2">
                          <div className="flex-shrink-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0 pr-2">
                                <CardTitle className="text-base sm:text-lg md:text-xl mb-1 line-clamp-2 text-gray-900 dark:text-white">
                                  {restaurant.name}
                                </CardTitle>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium mb-2 line-clamp-1">
                                  {restaurant.cuisine}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-yellow-400 text-yellow-400" />
                                    <span className="font-bold text-xs sm:text-sm text-yellow-700 dark:text-yellow-400">{restaurant.rating}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${favorite ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                                  }`}
                                onClick={handleToggleFavorite}
                              >
                                <Heart className={`h-4 w-4 sm:h-5 sm:w-5 ${favorite ? "fill-red-500 dark:fill-red-400" : ""}`} />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                                <span className="font-medium whitespace-nowrap">{restaurant.deliveryTime}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                                <span className="font-medium whitespace-nowrap">{restaurant.distance}</span>
                              </div>
                            </div>
                            <Button className="bg-primary-orange hover:opacity-90 dark:hover:opacity-80 text-white text-xs sm:text-sm h-7 sm:h-8 px-3 sm:px-4 flex-shrink-0 transition-opacity">
                              Order Now
                            </Button>
                          </div>
                        </div>
                      </CardContent>

                      <div className="w-36 sm:w-44 md:w-56 lg:w-64 xl:w-72 flex-shrink-0 relative overflow-hidden group/image">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-l from-black/20 dark:from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <div className="h-full flex cursor-not-allowed w-full">
                  <Card className="overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1a1a1a] pb-1 sm:pb-2 lg:pb-3 flex flex-col h-full w-full transition-all duration-300 opacity-70">
                    <div className="flex flex-row min-h-[120px] sm:min-h-[140px] md:min-h-[160px] lg:min-h-[180px] flex-1">
                      <CardContent className="flex-1 flex flex-col justify-between p-3 sm:p-4 md:p-5 lg:p-6 min-w-0 overflow-hidden">
                        <div className="flex-1 flex flex-col justify-between gap-2">
                          <div className="flex-shrink-0">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0 pr-2">
                                <CardTitle className="text-base sm:text-lg md:text-xl mb-1 line-clamp-2 text-gray-900 dark:text-white">
                                  {restaurant.name}
                                </CardTitle>
                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium mb-2 line-clamp-1">
                                  {restaurant.cuisine}
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                                    <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 fill-yellow-400 text-yellow-400" />
                                    <span className="font-bold text-xs sm:text-sm text-yellow-700 dark:text-yellow-400">{restaurant.rating}</span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${favorite ? "text-red-500 dark:text-red-400" : "text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                                  }`}
                                onClick={handleToggleFavorite}
                              >
                                <Heart className={`h-4 w-4 sm:h-5 sm:w-5 ${favorite ? "fill-red-500 dark:fill-red-400" : ""}`} />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                                <span className="font-medium whitespace-nowrap">{restaurant.deliveryTime}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                                <span className="font-medium whitespace-nowrap">{restaurant.distance}</span>
                              </div>
                            </div>
                            <Button className="bg-gray-400 text-white text-xs sm:text-sm h-7 sm:h-8 px-3 sm:px-4 flex-shrink-0 cursor-not-allowed">
                              Closed
                            </Button>
                          </div>
                        </div>
                      </CardContent>

                      <div className="w-36 sm:w-44 md:w-56 lg:w-64 xl:w-72 flex-shrink-0 relative overflow-hidden">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-semibold px-2 py-1 rounded-md">
                          Closed
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </ScrollReveal>
          )
        })}
      </div>
    )
  }, [loading, error, restaurants, emptyMessage, isFavorite, addFavorite, removeFavorite])

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 dark:from-[#0a0a0a] via-white dark:via-[#0a0a0a] to-orange-50/20 dark:to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10 space-y-4 sm:space-y-6 lg:space-y-8">
        <ScrollReveal>
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-5 mb-4 lg:mb-6">
            <Link to="/user">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 hover:bg-gray-100 dark:hover:bg-gray-800">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-gray-900 dark:text-gray-100" />
              </Button>
            </Link>
            <TextReveal className="flex items-center gap-2 sm:gap-3 lg:gap-4">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">
                All Restaurants
              </h1>
            </TextReveal>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="flex flex-wrap items-center gap-2 lg:mb-2">
            <button
              onClick={() => setDietaryFilter("all")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${dietaryFilter === "all"
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-gray-800 dark:hover:bg-gray-800"
                }`}
            >
              All
            </button>
            <button
              onClick={() => setDietaryFilter("veg")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${dietaryFilter === "veg"
                ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                : "bg-white text-gray-700 border-gray-200 hover:bg-green-50 hover:text-green-600 hover:border-green-200 dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-gray-800 dark:hover:bg-gray-800"
                }`}
            >
              <div className="w-3 h-3 border border-green-600 rounded-sm flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
              Veg
            </button>
            <button
              onClick={() => setDietaryFilter("non-veg")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${dietaryFilter === "non-veg"
                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                : "bg-white text-gray-700 border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:bg-[#1a1a1a] dark:text-gray-300 dark:border-gray-800 dark:hover:bg-gray-800"
                }`}
            >
              <div className="w-3 h-3 border border-red-600 rounded-sm flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
              </div>
              Non-Veg
            </button>
            <button
              onClick={() => setDietaryFilter("pure-veg")}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 ${dietaryFilter === "pure-veg"
                ? "bg-green-600 text-white border-green-600 dark:bg-green-500 dark:border-green-500"
                : "bg-white text-green-700 border-green-600 hover:bg-green-50 dark:bg-[#1a1a1a] dark:text-green-400 dark:hover:bg-green-900/20"
                }`}
            >
              <div className="w-3 h-3 border border-current rounded-sm flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-current" />
              </div>
              Pure Veg
            </button>
          </div>
        </ScrollReveal>

        {content}
      </div>
      <Footer />
    </AnimatedPage>
  )
}
