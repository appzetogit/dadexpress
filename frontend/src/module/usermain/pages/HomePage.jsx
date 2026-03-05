import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import Toast from "../components/Toast"
import { useLocation } from "@/module/user/hooks/useLocation"
import {
  MapPin,
  Bell,
  Search,
  Mic,
  ArrowRight,
  Home,
  Heart,
  ShoppingBag,
  Menu,
  ChefHat,
  Clock,
  Star,
  UtensilsCrossed,
  Store,
  Coffee,
  ChevronRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, restaurantAPI, adminAPI, heroBannerAPI } from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/config"

export default function HomePage() {
  const navigate = useNavigate()
  const { location, loading: locationLoading } = useLocation()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0)
  const [banners, setBanners] = useState([])
  const [categories, setCategories] = useState([])
  const [trendsItems, setTrendsItems] = useState([])
  const [popularRestaurants, setPopularRestaurants] = useState([])
  const [loadingBanners, setLoadingBanners] = useState(true)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingTrends, setLoadingTrends] = useState(true)
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const [wishlist, setWishlist] = useState(() => {
    // Load wishlist from localStorage
    const saved = localStorage.getItem('wishlist')
    return saved ? JSON.parse(saved) : []
  })
  const [toast, setToast] = useState({ show: false, message: '' })

  // Function to extract location parts for display
  // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
  // Sub location: City and State (e.g., "New Palasia, Indore")
  const getLocationDisplay = (fullAddress, city, state, area) => {
    if (!fullAddress) {
      // Fallback: Use area and city/state if available
      if (area) {
        return {
          main: area,
          sub: city && state ? `${city}, ${state}` : city || state || ""
        }
      }
      if (city) {
        return {
          main: city,
          sub: state || ""
        }
      }
      return { main: "Select location", sub: "" }
    }

    // Split address by comma
    const parts = fullAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

    // Main location: First 2 parts only (e.g., "Mama Loca, G-2")
    let mainLocation = ""
    if (parts.length >= 2) {
      mainLocation = parts.slice(0, 2).join(', ')
    } else if (parts.length >= 1) {
      mainLocation = parts[0]
    }

    // Sub location: City and State (prefer from location object, fallback to address parts)
    let subLocation = ""
    if (city && state) {
      subLocation = `${city}, ${state}`
    } else if (city) {
      subLocation = city
    } else if (state) {
      subLocation = state
    } else if (parts.length >= 5) {
      // Fallback: Try to extract city and state from address parts
      // Usually city and state are in the middle/end of address
      const cityIndex = parts.findIndex(p =>
        p.toLowerCase().includes('indore') ||
        p.toLowerCase().includes('city') ||
        (p.length > 3 && !p.match(/^\d/))
      )
      if (cityIndex !== -1 && cityIndex < parts.length - 1) {
        subLocation = `${parts[cityIndex]}, ${parts[cityIndex + 1]}`
      }
    }

    return {
      main: mainLocation || "Select location",
      sub: subLocation
    }
  }

  // Get location from localStorage as fallback
  const [storedLocation, setStoredLocation] = useState(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('userLocation')
      if (stored) {
        const parsed = JSON.parse(stored)
        setStoredLocation(parsed)
      }
    } catch (err) {
      console.error("Failed to parse stored location:", err)
    }
  }, [])

  // Use location from hook, fallback to stored location
  const currentLocation = location || storedLocation

  // Get display location parts
  // Priority: formattedAddress > address > area/city
  // IMPORTANT: Sub location ALWAYS uses city and state from location object, never from address parts
  const locationDisplay = (() => {
    let mainLocation = ""
    let subLocation = ""

    // Get main location from address (first 2 parts)
    if (currentLocation?.formattedAddress) {
      const parts = currentLocation.formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)
      if (parts.length >= 2) {
        mainLocation = parts.slice(0, 2).join(', ')
      } else if (parts.length >= 1) {
        mainLocation = parts[0]
      }
    } else if (currentLocation?.address) {
      const parts = currentLocation.address.split(',').map(part => part.trim()).filter(part => part.length > 0)
      if (parts.length >= 2) {
        mainLocation = parts.slice(0, 2).join(', ')
      } else if (parts.length >= 1) {
        mainLocation = parts[0]
      }
    } else if (currentLocation?.area) {
      mainLocation = currentLocation.area
    } else if (currentLocation?.city) {
      mainLocation = currentLocation.city
    } else {
      mainLocation = "Select location"
    }

    // Sub location: ALWAYS use city and state from location object (never from address parts)
    // Check if city and state exist in location object
    const hasCity = currentLocation?.city && currentLocation.city.trim() !== "" && currentLocation.city !== "Unknown City"
    const hasState = currentLocation?.state && currentLocation.state.trim() !== ""

    if (hasCity && hasState) {
      subLocation = `${currentLocation.city}, ${currentLocation.state}`
    } else if (hasCity) {
      subLocation = currentLocation.city
    } else if (hasState) {
      subLocation = currentLocation.state
    } else {
      // If city/state not available in location object, try to extract from formattedAddress
      // This is a fallback - formattedAddress format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
      if (currentLocation?.formattedAddress) {
        const parts = currentLocation.formattedAddress.split(',').map(part => part.trim()).filter(part => part.length > 0)

        // For Indian addresses: city and state are usually before pincode (which is a 6-digit number)
        if (parts.length >= 4) {
          // Find pincode index (6-digit number)
          const pincodeIndex = parts.findIndex(part => /^\d{6}$/.test(part))

          if (pincodeIndex > 1) {
            // City is 2 positions before pincode, State is 1 position before pincode
            const cityPart = parts[pincodeIndex - 2]
            const statePart = parts[pincodeIndex - 1]

            // Validate: both should be non-empty and not numbers
            if (cityPart && statePart &&
              !cityPart.match(/^\d+$/) &&
              !statePart.match(/^\d+$/) &&
              cityPart.length > 2 &&
              statePart.length > 2) {
              subLocation = `${cityPart}, ${statePart}`
            }
          }

          // Method 2: Direct extraction - if we have 8 parts, city and state are at index 4 and 5
          // Format: "Mama Loca, G-2, Princess Center 6/3, Opposite Manpasand Garden, New Palasia, Indore, 452001, India"
          // parts[4] = "New Palasia" (city), parts[5] = "Indore" (state)
          if (!subLocation && parts.length >= 6) {
            // If we have pincode at index 6, city and state are at 4 and 5
            if (pincodeIndex === 6 && parts.length >= 7) {
              const cityPart = parts[4]
              const statePart = parts[5]

              if (cityPart && statePart &&
                !cityPart.match(/^\d+$/) &&
                !statePart.match(/^\d+$/) &&
                cityPart.length > 2 &&
                statePart.length > 2) {
                subLocation = `${cityPart}, ${statePart}`
              }
            }
          }

          // Method 3: Simple fallback - if we have 6+ parts, always try parts[4] and parts[5]
          // This is the most reliable method for the given address format
          if (!subLocation && parts.length >= 6) {
            // Directly use parts[4] and parts[5] if they look like city/state
            const cityPart = parts[4]
            const statePart = parts[5]

            if (cityPart && statePart &&
              !cityPart.match(/^\d+$/) &&
              !statePart.match(/^\d+$/) &&
              cityPart.length > 2 &&
              statePart.length > 2 &&
              !cityPart.toLowerCase().includes("center") &&
              !cityPart.toLowerCase().includes("princess") &&
              !cityPart.toLowerCase().includes("opposite") &&
              !cityPart.toLowerCase().includes("garden")) {
              subLocation = `${cityPart}, ${statePart}`
            }
          }

          // Method 4: Fallback - If pincode not found or extraction failed, try alternative method
          if (!subLocation && parts.length >= 4) {
            // Last part is usually "India", second last might be pincode
            const lastPart = parts[parts.length - 1]
            const secondLastPart = parts[parts.length - 2]

            // If last part is "India" and second last is pincode (6-digit)
            if (lastPart === "India" && /^\d{6}$/.test(secondLastPart)) {
              // City and state are 3 and 4 positions before "India"
              // Format: "..., New Palasia, Indore, 452001, India"
              // parts[length-1] = "India"
              // parts[length-2] = "452001" (pincode)
              // parts[length-3] = "Indore" (state)
              // parts[length-4] = "New Palasia" (city)
              const cityPart = parts[parts.length - 4]
              const statePart = parts[parts.length - 3]

              if (cityPart && statePart &&
                !cityPart.match(/^\d+$/) &&
                !statePart.match(/^\d+$/) &&
                cityPart.length > 2 &&
                statePart.length > 2) {
                subLocation = `${cityPart}, ${statePart}`
              }
            }
          }
        }
      }

      // If still empty, leave it empty
      if (!subLocation) {
        subLocation = ""
      }
    }

    return {
      main: mainLocation,
      sub: subLocation
    }
  })()

  // Debug: Log location data
  useEffect(() => {
    console.log("📍 HomePage - Location state:", {
      hasLocation: !!location,
      hasStoredLocation: !!storedLocation,
      location: location,
      storedLocation: storedLocation,
      currentLocation: currentLocation,
      formattedAddress: currentLocation?.formattedAddress,
      address: currentLocation?.address,
      city: currentLocation?.city,
      state: currentLocation?.state,
      area: currentLocation?.area,
      display: locationDisplay
    })
  }, [location, storedLocation, currentLocation, locationDisplay])

  // Show toast notification
  const showToast = (message) => {
    setToast({ show: true, message })
    setTimeout(() => {
      setToast({ show: false, message: '' })
    }, 3000)
  }

  // Engaging placeholder texts that rotate
  const placeholderTexts = [
    "Are you hungry !!",
    "Search for delicious food...",
    "What would you like to eat?",
    "Find your favorite restaurant",
    "Craving something special?",
    "Discover amazing dishes",
    "Order your favorite meal",
    "Explore new flavors",
    "Find the best deals",
    "What's cooking today?",
    "Search restaurants nearby",
    "Hungry? We've got you!",
  ]

  // Fetch All Dynamic Data
  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch Banners
      try {
        setLoadingBanners(true)
        const response = await api.get(API_ENDPOINTS.HERO_BANNER.PUBLIC)
        if (response.data.success && response.data.data.banners) {
          setBanners(response.data.data.banners)
        }
      } catch (error) {
        console.error("Error fetching banners:", error)
      } finally {
        setLoadingBanners(false)
      }

      // 2. Fetch Categories
      try {
        setLoadingCategories(true)
        const response = await adminAPI.getPublicCategories()
        if (response.data.success && response.data.data.categories) {
          setCategories(response.data.data.categories)
        }
      } catch (error) {
        console.error("Error fetching categories:", error)
      } finally {
        setLoadingCategories(false)
      }

      // 3. Fetch Popular Restaurants (for Popular section)
      try {
        setLoadingRestaurants(true)
        const response = await restaurantAPI.getRestaurants({ limit: 10, isActive: true })
        if (response.data.success && response.data.data.restaurants) {
          setPopularRestaurants(response.data.data.restaurants)
        }
      } catch (error) {
        console.error("Error fetching popular restaurants:", error)
      } finally {
        setLoadingRestaurants(false)
      }

      // 4. Fetch Trends (using Top 10 API for trends)
      try {
        setLoadingTrends(true)
        const response = await heroBannerAPI.getTop10Restaurants()
        if (response.data.success && response.data.data.restaurants) {
          // Flatten dishes from top restaurants to show as trends
          const allDishes = response.data.data.restaurants.flatMap(r =>
            (r.menuItems || []).slice(0, 2).map(item => ({
              ...item,
              restaurantName: r.name,
              restaurantId: r._id
            }))
          )
          setTrendsItems(allDishes.slice(0, 6))
        }
      } catch (error) {
        console.error("Error fetching trends:", error)
      } finally {
        setLoadingTrends(false)
      }
    }

    fetchData()
  }, [])

  // Auto-slide effect
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    // Auto-slide carousel
    const interval = setInterval(() => {
      if (banners.length > 0) {
        setCurrentSlide((prev) => (prev + 1) % banners.length)
      }
    }, 4000) // Change slide every 4 seconds

    return () => {
      clearInterval(interval)
      lenis.destroy()
    }
  }, [banners.length])

  // Rotate placeholder text
  useEffect(() => {
    const placeholderInterval = setInterval(() => {
      setCurrentPlaceholderIndex((prev) => (prev + 1) % placeholderTexts.length)
    }, 2000) // Change placeholder every 2 seconds

    return () => clearInterval(placeholderInterval)
  }, [placeholderTexts.length])

  // Save wishlist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('wishlist', JSON.stringify(wishlist))
    // Dispatch custom event to notify other components
    window.dispatchEvent(new Event('wishlistUpdated'))
  }, [wishlist])

  // Toggle wishlist item
  const toggleWishlist = (item, type = 'food') => {
    const itemId = type === 'food' ? `food-${item.id}` : `restaurant-${item.id}`
    const { id, ...restItem } = item
    const wishlistItem = {
      id: itemId,
      type,
      originalId: item.id, // Store original ID separately
      ...restItem
    }

    setWishlist((prev) => {
      const isInWishlist = prev.some((w) => w.id === itemId)
      if (isInWishlist) {
        return prev.filter((w) => w.id !== itemId)
      } else {
        // Show toast notification
        const itemName = type === 'food' ? item.name : item.name
        setToast({
          show: true,
          message: `Your ${type === 'food' ? 'food item' : 'restaurant'} "${itemName}" is added to wishlist`
        })
        setTimeout(() => {
          setToast({ show: false, message: '' })
        }, 3000)
        return [...prev, wishlistItem]
      }
    })
  }

  // Check if item is in wishlist
  const isInWishlist = (item, type = 'food') => {
    const itemId = type === 'food' ? `food-${item.id}` : `restaurant-${item.id}`
    return wishlist.some((w) => w.id === itemId)
  }


  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-20">
      {/* Toast Notification */}
      <Toast show={toast.show} message={toast.message} />
      {/* Top Header - Orange Bar - Reduced Size */}
      <div className="bg-[#ff8100] w-full px-4 py-3 relative rounded-b-3xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MapPin className="w-4 h-4 text-white flex-shrink-0" fill="red" />
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium mb-0.5">Your Location</p>
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  {locationLoading && !location ? (
                    <p className="text-white text-sm font-bold truncate">
                      Loading...
                    </p>
                  ) : (
                    <>
                      <p className="text-white text-sm font-bold truncate">
                        {locationDisplay.main || "Select location"}
                      </p>
                      {locationDisplay.sub && (
                        <p className="text-white text-[10px] truncate">
                          {locationDisplay.sub}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <svg className="w-2.5 h-2.5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          <button className="p-1 flex-shrink-0">
            <Bell className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Search Bar Container - Adjusted */}
      <div className="px-4 pt-3 pb-4 relative -mt-5">
        {/* Search Bar - Half above header, half below, more rounded, less width */}
        <div className="bg-white rounded-2xl flex items-center gap-3 px-4 py-3 shadow-lg mx-auto max-w-[90%] relative z-10">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={placeholderTexts[currentPlaceholderIndex]}
            className="flex-1 outline-none text-sm text-gray-700 placeholder-gray-400 transition-all duration-300"
          />
          <button className="p-1">
            <Mic className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="px-4 mb-6">
        <div
          className="relative rounded-xl overflow-hidden h-36 md:h-48 cursor-pointer bg-gray-200 animate-pulse"
          onClick={() => banners[currentSlide] && navigate(`/usermain/category/${banners[currentSlide].title}`)}
        >
          {loadingBanners ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400">Loading Banners...</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {banners.length > 0 && (
                <motion.div
                  key={currentSlide}
                  initial={{ opacity: 0, x: 300 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -300 }}
                  transition={{
                    duration: 0.6,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                  className="absolute inset-0"
                >
                  <img
                    src={banners[currentSlide].image}
                    alt={banners[currentSlide].title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = `https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=1200&h=600&fit=crop`
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
                  <div className="absolute inset-0 flex items-center px-4 py-3">
                    <div className="flex-1 z-10">
                      <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="text-white text-base md:text-xl font-bold mb-2 md:mb-3"
                      >
                        {banners[currentSlide].title}
                      </motion.h2>
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3"
                      >
                        <Button
                          className="bg-transparent border-2 border-[#ff8100] text-white hover:bg-[#ff8100] rounded-full px-3 md:px-5 py-1.5 md:py-2 text-xs md:text-sm font-semibold transition-colors"
                        >
                          Order Now
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          <div className="absolute bottom-2 md:bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
            {banners.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentSlide(index)
                }}
                className={`h-1.5 md:h-2 rounded-full transition-all duration-300 ${index === currentSlide ? 'bg-[#ff8100] w-5 md:w-6' : 'bg-white/50 w-1.5 md:w-2 hover:bg-white/70'
                  }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* What's on Your Mind? Section - Moved Up */}
      <div className="px-4 mb-6 -mt-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base md:text-lg font-bold text-gray-900">What's on Your Mind?</h3>
          <button
            onClick={() => navigate("/usermain/categories")}
            className="bg-[#ff8100] rounded-full p-1.5 hover:bg-[#e67300] transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="overflow-hidden -mx-4">
          <div className={`flex gap-3 ${categories.length > 5 ? 'animate-scroll' : 'px-4'}`}>
            {loadingCategories ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-20 flex flex-col items-center gap-1.5">
                  <div className="w-18 h-18 rounded-full bg-gray-200 animate-pulse" />
                </div>
              ))
            ) : (
              (categories.length > 5 ? [...categories, ...categories] : categories).map((category, index) => (
                <div
                  key={`${category.id}-${index}`}
                  className="flex-shrink-0 w-20 flex flex-col items-center gap-1.5 cursor-pointer"
                  onClick={() => navigate(`/usermain/category/${category.slug || category.name}`)}
                >
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-gray-100 bg-white">
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop`
                      }}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-gray-700 text-center leading-tight">{category.name}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Today's Trends Section */}
      <div className="px-4 mb-6">
        <h3 className="text-lg font-bold text-[#ff8100] mb-1">Today's Trends</h3>
        <p className="text-sm text-gray-600 mb-4">Here's what you might like to taste</p>

        <div className="grid grid-cols-2 gap-3">
          {loadingTrends ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl h-48 animate-pulse" />
            ))
          ) : trendsItems.length === 0 ? (
            <div className="col-span-2 text-center py-4 text-gray-500">No items trending right now</div>
          ) : (
            trendsItems.map((item) => (
              <motion.div
                key={item._id || item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                whileHover={{ y: -5 }}
                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full"
                onClick={() => navigate(`/usermain/food/${item._id || item.id}`)}
              >
                {/* Image Container */}
                <div className="relative flex-shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-32 object-cover rounded-t-xl"
                    onError={(e) => {
                      e.target.src = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=400&fit=crop`
                    }}
                  />
                  {/* Price Badge */}
                  <div className="absolute top-1.5 left-1.5 bg-white border-2 border-black rounded-full px-2 py-0.5">
                    <span className="text-[10px] font-bold text-gray-900">₹{item.price}</span>
                  </div>
                  {/* Favorite Icon */}
                  <button
                    className="absolute top-1.5 right-1.5 p-0.5 hover:scale-110 transition-transform z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWishlist(item, 'food')
                    }}
                  >
                    <Heart
                      className={`w-4 h-4 transition-all ${isInWishlist(item, 'food')
                        ? 'text-red-500 fill-red-500'
                        : 'text-gray-400 hover:text-red-500'
                        }`}
                    />
                  </button>
                </div>

                {/* Content */}
                <div className="p-2.5 flex flex-col flex-1">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-bold text-gray-900 flex-1 line-clamp-2">{item.name}</h4>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span className="text-[10px] font-semibold text-gray-900">{item.rating || '4.5'}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-2 truncate">from {item.restaurantName || 'Dad Express'}</p>

                  <Button
                    className="w-full bg-[#ff8100] hover:bg-[#e67300] text-white text-xs font-semibold py-1.5 rounded-lg mt-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      showToast("Item added to the cart")
                    }}
                  >
                    Add
                  </Button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Popular Restaurants Section - Horizontal Scrollable */}
      <div className="px-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Popular Restaurants</h3>
          <button className="w-8 h-8 rounded-full border-2 border-[#ff8100] flex items-center justify-center hover:bg-[#ff8100]/10 transition-colors">
            <ArrowRight className="w-4 h-4 text-[#ff8100]" />
          </button>
        </div>

        <div className="flex gap-4 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-4">
          {loadingRestaurants ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[200px] bg-white rounded-xl h-60 animate-pulse" />
            ))
          ) : popularRestaurants.length === 0 ? (
            <div className="w-full text-center py-4 text-gray-500">No restaurants found near you</div>
          ) : (
            popularRestaurants.map((restaurant) => (
              <motion.div
                key={restaurant._id || restaurant.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                whileHover={{ y: -5 }}
                className="flex-shrink-0 w-[200px] bg-white rounded-xl overflow-visible shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/user/restaurants/${restaurant.slug || (restaurant.name.toLowerCase().replace(/\s+/g, '-'))}`)}
              >
                {/* Food Image - Large */}
                <div className="relative w-full h-36 rounded-t-xl overflow-hidden bg-gray-100">
                  <img
                    src={restaurant.coverImages?.[0]?.url || restaurant.profileImage?.url || "https://images.unsplash.com/photo-1546241072-48010ad2862c?w=400&h=300&fit=crop"}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = `https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=300&fit=crop`
                    }}
                  />
                  <button
                    className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-full hover:scale-110 transition-transform z-10"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWishlist(restaurant, 'restaurant')
                    }}
                  >
                    <Heart
                      className={`w-4 h-4 transition-all ${isInWishlist(restaurant, 'restaurant')
                        ? 'text-amber-700 fill-amber-700'
                        : 'text-gray-400 hover:text-amber-700'
                        }`}
                    />
                  </button>
                  <div className="absolute bottom-2 right-2 bg-white border-2 border-[#ff8100] rounded-lg px-2.5 py-1 shadow-md">
                    <span className="text-[10px] font-bold text-gray-900">{restaurant.distance || '1.5 km'}</span>
                  </div>
                </div>

                {/* Restaurant Details */}
                <div className="p-3 pt-2 relative">
                  <div className="absolute -top-5 left-3 w-10 h-10 bg-white border border-gray-300 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md z-10 overflow-hidden p-1">
                    {restaurant.logo?.url ? (
                      <img src={restaurant.logo.url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <UtensilsCrossed className="w-5 h-5 text-[#ff8100]" />
                    )}
                  </div>

                  <div className="ml-11 mb-2">
                    <h4 className="text-xs font-bold text-gray-900 mb-0.5 line-clamp-1">{restaurant.name}</h4>
                    <p className="text-[9px] text-gray-600 line-clamp-1 leading-tight">
                      {restaurant.cuisineType?.join(', ') || 'Various Cuisines'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 mt-1 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-[#ff8100] fill-[#ff8100]" />
                      <span className="text-[10px] font-semibold text-gray-900">{restaurant.rating || '4.2'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#ff8100]" />
                      <span className="text-[10px] font-medium text-gray-900">{restaurant.deliveryTime || '25-35 min'}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Find Nearby Restaurant Banner */}
      <div className="px-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-r from-[#f6e9dc] to-[#fef5e7] rounded-2xl overflow-hidden shadow-md relative min-h-[140px] md:min-h-[180px]"
        >
          <div className="flex items-center gap-3 md:gap-6 p-4 md:p-8 h-full">
            {/* Left Side - Cafe Illustration */}
            <div className="flex items-center justify-center flex-shrink-0 w-24 h-24 md:w-40 md:h-40 relative">
              {/* Umbrella with alternating orange and white segments */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-16 md:w-28 md:h-28 z-10">
                <div className="relative w-full h-full">
                  {/* Umbrella segments */}
                  <div className="absolute inset-0 rounded-t-full overflow-hidden">
                    <div className="w-full h-full bg-[#ff8100]"></div>
                    <div className="absolute top-0 left-0 w-1/2 h-full bg-white rounded-tl-full"></div>
                  </div>
                  {/* Umbrella pole */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-10 md:h-16 bg-gray-400 rounded-full"></div>
                </div>
              </div>
              {/* Table with white tablecloth */}
              <div className="absolute bottom-6 md:bottom-12 left-1/2 -translate-x-1/2 w-14 h-14 md:w-24 md:h-24 bg-white rounded-full shadow-lg flex items-center justify-center z-20">
                <div className="relative">
                  <div className="w-7 h-7 md:w-12 md:h-12 bg-green-500 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 md:w-7 md:h-7 bg-red-500 rounded-full"></div>
                  </div>
                </div>
              </div>
              {/* Chairs */}
              <div className="absolute bottom-3 md:bottom-8 left-3 md:left-8 w-6 h-6 md:w-10 md:h-10 z-10">
                <div className="w-full h-full relative">
                  {/* Chair frame */}
                  <div className="absolute inset-0 border-2 border-gray-800 rounded-lg"></div>
                  {/* Chair seat */}
                  <div className="absolute bottom-0 left-0 right-0 h-2.5 md:h-4 bg-[#ff8100] rounded-b-lg"></div>
                </div>
              </div>
              <div className="absolute bottom-3 md:bottom-8 right-3 md:right-8 w-6 h-6 md:w-10 md:h-10 z-10">
                <div className="w-full h-full relative">
                  {/* Chair frame */}
                  <div className="absolute inset-0 border-2 border-gray-800 rounded-lg"></div>
                  {/* Chair seat */}
                  <div className="absolute bottom-0 left-0 right-0 h-2.5 md:h-4 bg-[#ff8100] rounded-b-lg"></div>
                </div>
              </div>
            </div>

            {/* Center - Text Content */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h3 className="text-base md:text-2xl font-bold text-gray-900 mb-0.5 md:mb-2 whitespace-nowrap">Find Nearby</h3>
              <p className="text-[10px] md:text-sm text-gray-700 leading-tight">Restaurant Near from You</p>
            </div>

            {/* Right Side - Button with Map Pin */}
            <div className="flex flex-col items-center gap-2 md:gap-3 flex-shrink-0">
              <div className="relative">
                <MapPin className="w-6 h-6 md:w-10 md:h-10 text-red-500" fill="red" />
              </div>
              <Button
                onClick={() => {
                  console.log("See Location clicked")
                }}
                className="bg-[#ff8100] hover:bg-[#e67300] text-white font-semibold px-4 py-2 md:px-8 md:py-3 rounded-lg text-sm md:text-base shadow-md transition-all hover:scale-105 whitespace-nowrap"
              >
                See Location
              </Button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex items-center justify-around py-2 px-4">
          <button className="flex flex-col items-center gap-1 p-2 text-[#ff8100]">
            <Home className="w-6 h-6" />
            <span className="text-xs text-[#ff8100] font-medium">Home</span>
          </button>
          <button
            onClick={() => navigate('/usermain/wishlist')}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <Heart className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Wishlist</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 -mt-8">
            <div className="bg-white rounded-full p-3 shadow-lg border-2 border-gray-200">
              <ChefHat className="w-6 h-6 text-gray-600" />
            </div>
          </button>
          <button
            onClick={() => navigate('/usermain/orders')}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 hover:text-[#ff8100] transition-colors"
          >
            <ShoppingBag className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Orders</span>
          </button>
          <button className="flex flex-col items-center gap-1 p-2 text-gray-600">
            <Menu className="w-6 h-6" />
            <span className="text-xs text-gray-600 font-medium">Menu</span>
          </button>
        </div>
      </div>
    </div>
  )
}
