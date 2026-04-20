import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { MapPin, Search, Mic, SlidersHorizontal, Star, X, ArrowDownUp, Timer, IndianRupee, UtensilsCrossed, BadgePercent, ShieldCheck, Clock, Bookmark, Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import AnimatedPage from "../components/AnimatedPage"
import { useSearchOverlay, useLocationSelector } from "../components/UserLayout"
import { useLocation as useLocationHook } from "../hooks/useLocation"
import { useProfile } from "../context/ProfileContext"
import { diningAPI } from "@/lib/api"
import api from "@/lib/api"
import PageNavbar from "../components/PageNavbar"
import OptimizedImage from "@/components/OptimizedImage"
import quickSpicyLogo from "@/assets/quicky-spicy-logo.png"
// Using placeholders for dining card images
const diningCard1 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard2 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard3 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard4 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard5 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"
const diningCard6 = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=300&fit=crop"

// Using placeholder for dining banner
const diningBanner = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=400&fit=crop"
// Using placeholders for dining page images
const upto50off = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
const nearAndTopRated = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=200&fit=crop"
// Using placeholder for coffee banner
const coffeeBanner = "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=400&fit=crop"
// Using placeholders for bank logos
const axisLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const barodaLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const hdfcLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const iciciLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const pnbLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"
const sbiLogo = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=200&h=100&fit=crop"

// Mock data removed in favor of dynamic fetching
const diningCategories = []

const limelightRestaurants = []

const bankOffers = []

const MOCK_BANK_OFFERS = bankOffers

const popularRestaurants = []
// Static data removed in favor of dynamic fetching
const MOCK_CATEGORIES = diningCategories
const MOCK_LIMELIGHT = limelightRestaurants
const MOCK_MUST_TRIES = []
const MOCK_RESTAURANTS = popularRestaurants

export default function Dining() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState("")
  const [currentRestaurantIndex, setCurrentRestaurantIndex] = useState(0)
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState('sort')
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [selectedBankOffer, setSelectedBankOffer] = useState(null)
  const filterSectionRefs = useRef({})
  const rightContentRef = useRef(null)
  const { openSearch, closeSearch, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  const { location, loading: locationLoading, isManualMode } = useLocationHook()
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const [categories, setCategories] = useState([])
  const [limelightItems, setLimelightItems] = useState([])
  const [mustTryItems, setMustTryItems] = useState([])
  const [restaurantList, setRestaurantList] = useState([])
  const [bankOfferItems, setBankOfferItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [diningHeroBanners, setDiningHeroBanners] = useState([])
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  useEffect(() => {
    const fetchDiningHeroBanner = async () => {
      try {
        const response = await api.get('/hero-banners/dining/public')
        if (response.data.success && response.data.data.banners && response.data.data.banners.length > 0) {
          setDiningHeroBanners(response.data.data.banners)
        } else {
          setDiningHeroBanners([diningBanner])
        }
      } catch (error) {
        console.error("Failed to fetch dining hero banner", error)
        setDiningHeroBanners([diningBanner])
      }
    }
    fetchDiningHeroBanner()
  }, [])

  // Auto-slide banners
  useEffect(() => {
    if (diningHeroBanners.length > 1) {
      const interval = setInterval(() => {
        setCurrentBannerIndex((prev) => (prev + 1) % diningHeroBanners.length)
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [diningHeroBanners])

  useEffect(() => {
    // Wait for initial location detection to finish before fetching data
    if (locationLoading && !isManualMode) {
      setLoading(true)
      return
    }

    const fetchDiningData = async () => {
      try {
        const [cats, limes, tries, rests, offers] = await Promise.all([
          diningAPI.getCategories(),
          diningAPI.getOfferBanners(),
          diningAPI.getStories(),
          diningAPI.getRestaurants(location?.city ? { city: location.city } : {}),
          diningAPI.getBankOffers()
        ])

        if (cats.data.success && cats.data.data.length > 0) setCategories(cats.data.data)
        if (limes.data.success && limes.data.data.length > 0) {
          setLimelightItems(limes.data.data)
        }
        if (tries.data.success && tries.data.data.length > 0) setMustTryItems(tries.data.data)
        if (rests.data.success && rests.data.data.length > 0) setRestaurantList(rests.data.data)
        if (offers.data.success && offers.data.data.length > 0) setBankOfferItems(offers.data.data)
      } catch (error) {
        console.error("Failed to fetch dining data", error)
      } finally {
        setLoading(false)
      }
    }
    fetchDiningData()
  }, [location?.city])

  const toggleFilter = (filterId) => {
    setActiveFilters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(filterId)) {
        newSet.delete(filterId)
      } else {
        newSet.add(filterId)
      }
      return newSet
    })
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = [...restaurantList]

    if (activeFilters.has('delivery-under-30')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 30
      })
    }
    if (activeFilters.has('delivery-under-45')) {
      filtered = filtered.filter(r => {
        const timeMatch = r.deliveryTime.match(/(\d+)/)
        return timeMatch && parseInt(timeMatch[1]) <= 45
      })
    }
    if (activeFilters.has('distance-under-1km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance?.match(/(\d+\.?\d*)/);
        if (!distMatch) return false;
        const val = parseFloat(distMatch[1]);
        if (r.distance?.toLowerCase().includes('m') && !r.distance?.toLowerCase().includes('km')) {
          return (val / 1000) <= 1.0;
        }
        return val <= 1.0;
      });
    }
    if (activeFilters.has('distance-under-2km')) {
      filtered = filtered.filter(r => {
        const distMatch = r.distance?.match(/(\d+\.?\d*)/);
        if (!distMatch) return false;
        const val = parseFloat(distMatch[1]);
        if (r.distance?.toLowerCase().includes('m') && !r.distance?.toLowerCase().includes('km')) {
          return (val / 1000) <= 2.0;
        }
        return val <= 2.0;
      });
    }
    if (activeFilters.has('rating-35-plus')) {
      filtered = filtered.filter(r => r.rating >= 3.5)
    }
    if (activeFilters.has('rating-4-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.0)
    }
    if (activeFilters.has('rating-45-plus')) {
      filtered = filtered.filter(r => r.rating >= 4.5)
    }

    // Apply cuisine filter
    if (selectedCuisine) {
      filtered = filtered.filter(r => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    }

    // Apply sorting
    if (sortBy === 'rating-high') {
      filtered.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === 'rating-low') {
      filtered.sort((a, b) => a.rating - b.rating)
    }

    return filtered
  }, [activeFilters, selectedCuisine, sortBy])


  const handleSearchFocus = useCallback(() => {
    if (heroSearch) {
      setSearchValue(heroSearch)
    }
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  // Auto-play carousel
  useEffect(() => {
    if (limelightItems.length === 0) return

    const interval = setInterval(() => {
      setCurrentRestaurantIndex((prev) => (prev + 1) % limelightItems.length)
    }, 2000) // Change every 2 seconds

    return () => clearInterval(interval)
  }, [limelightItems.length])


  return (
    <AnimatedPage className="bg-white dark:bg-[#0a0a0a]" style={{ minHeight: '100vh', paddingBottom: '80px', overflow: 'visible' }}>
      {/* Sticky Header Wrapper */}
      <div className="sticky top-0 z-40 w-full bg-white dark:bg-[#0a0a0a] shadow-sm md:hidden">
        {/* Navbar Section */}
        <div className="relative z-20 pt-2 sm:pt-3 lg:pt-4">
          <PageNavbar
            textColor="dark"
            zIndex={20}
            onNavClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Search Bar Section */}
        <section
          className="relative z-20 w-full py-3 sm:py-4 md:py-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative z-20 w-full px-3 sm:px-6 lg:px-8">
            {/* Search Bar Container */}
            <div className="z-20">
              {/* Enhanced Search Bar */}
              <div className="w-full relative">
                <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-1 sm:p-1.5 transition-all duration-300 hover:shadow-xl">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Search className="h-4 w-4 sm:h-4 sm:w-4 text-[#EB590E] flex-shrink-0 ml-2 sm:ml-3" strokeWidth={2.5} />
                    <div className="flex-1 relative">
                      <Input
                        value={heroSearch}
                        onChange={(e) => setHeroSearch(e.target.value)}
                        onFocus={handleSearchFocus}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && heroSearch.trim()) {
                            navigate(`/user/search?q=${encodeURIComponent(heroSearch.trim())}`)
                            closeSearch()
                            setHeroSearch("")
                          }
                        }}
                        className="pl-0 pr-2 h-8 sm:h-9 w-full bg-transparent border-0 text-sm sm:text-base font-semibold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 rounded-full placeholder:font-semibold placeholder:text-gray-400 dark:placeholder:text-gray-500"
                        placeholder='Search "burger"'
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchFocus}
                      className="flex-shrink-0 mr-2 sm:mr-3 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                    >
                      <Mic className="h-4 w-4 sm:h-4 sm:w-4 text-gray-500 dark:text-gray-400" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Banner Section */}
      <div
        className="relative w-full px-3 sm:px-4 md:px-6 lg:px-8 pb-4 sm:pb-6 cursor-pointer"
        onClick={() => navigate('/user/dining/restaurants')}
      >
        <div className="relative w-full h-[30vh] sm:h-[35vh] lg:h-[40vh] rounded-2xl overflow-hidden shadow-lg">
          {diningHeroBanners.length > 0 && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentBannerIndex}
                initial={{ opacity: 0.5 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0.5 }}
                transition={{ duration: 0.8 }}
                className="w-full h-full absolute inset-0"
              >
                <OptimizedImage
                  src={diningHeroBanners[currentBannerIndex]}
                  alt={`Dining Banner ${currentBannerIndex + 1}`}
                  className="w-full h-full"
                  objectFit="cover"
                  priority={true}
                  sizes="100vw"
                />
              </motion.div>
            </AnimatePresence>
          )}

          {/* Pagination Indicators */}
          {diningHeroBanners.length > 1 && (
            <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 flex space-x-2 z-10 bg-black/30 px-3 py-1.5 rounded-full backdrop-blur-sm">
              {diningHeroBanners.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCurrentBannerIndex(index)
                  }}
                  className={`h-1.5 md:h-2 rounded-full transition-all duration-300 ${
                    index === currentBannerIndex
                      ? 'w-4 md:w-6 bg-white'
                      : 'w-1.5 md:w-2 bg-white/50 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 pt-6 sm:pt-8 md:pt-10 lg:pt-12 pb-6 md:pb-8 lg:pb-10">
        {/* Categories Section */}
        <div className="mb-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                What are you looking for?
              </h3>
            </div>
          </div>

          {/* Light blue-grey background container */}
          {/* Modern Grid Layout */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {categories.map((category, index) => (
              <Link
                key={category._id || category.id}
                to={`/user/dining/${category.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <motion.div
                  className="relative rounded-2xl overflow-hidden shadow-sm cursor-pointer group h-[120px] sm:h-[140px] md:h-[160px]"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -5, boxShadow: "0 10px 20px -5px rgba(0, 0, 0, 0.15)" }}
                >
                  <div className="absolute inset-0">
                    <OptimizedImage
                      src={category.imageUrl}
                      alt={category.name}
                      className="w-full h-full transition-transform duration-700 group-hover:scale-110"
                      objectFit="cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      placeholder="blur"
                      priority={index < 4}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 flex flex-col justify-end h-full">
                    <p className="text-sm sm:text-base font-bold text-white leading-tight drop-shadow-md group-hover:text-[#EB590E] transition-colors">
                      {category.name}
                    </p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>

        {/* In the Limelight Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                In the Limelight
              </h3>
            </div>
          </div>

          {/* Landscape Carousel */}
          <div className="relative w-full h-[200px] sm:h-[280px] md:h-[350px] lg:h-[400px] rounded-2xl overflow-hidden shadow-lg">
            {/* Carousel Container */}
            <div
              className="flex h-full transition-transform duration-700 ease-in-out"
              style={{ transform: `translateX(-${currentRestaurantIndex * 100}%)` }}
            >
              {limelightItems.map((restaurant, index) => (
                <div
                  key={restaurant._id || restaurant.id}
                  className="min-w-full h-full relative flex-shrink-0 w-full"
                >
                  {/* Restaurant Image */}
                  <OptimizedImage
                    src={restaurant.imageUrl}
                    alt={restaurant.tagline}
                    className="w-full h-full"
                    objectFit="cover"
                    sizes="100vw"
                    placeholder="blur"
                    priority={index === 0}
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-90" />

                  {/* Content Container */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 z-10 flex flex-col items-start gap-2">
                    {/* Discount Badge */}
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-[#EB590E] text-white px-3 py-1 rounded-full shadow-lg mb-1"
                    >
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">
                        {restaurant.percentageOff}
                      </span>
                    </motion.div>

                    {/* Restaurant Name */}
                    <motion.h4
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-lg"
                    >
                      {restaurant.restaurant?.name}
                    </motion.h4>

                    {/* Tagline */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-sm sm:text-base font-medium text-gray-200 line-clamp-1 max-w-[90%]"
                    >
                      {restaurant.tagline}
                    </motion.p>
                  </div>
                </div>
              ))}
            </div>

            {/* Carousel Indicators */}
            <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 z-10 flex gap-2">
              {limelightItems.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentRestaurantIndex(index)}
                  className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full transition-all ${index === currentRestaurantIndex
                    ? "bg-white w-6 sm:w-8"
                    : "bg-white/50"
                    }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>



        {/* Must Tries in Indore Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Must Tries
              </h3>
            </div>
          </div>

          {/* Horizontal Scroll Container */}
          <div
            className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8"
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <style>{`
              .must-tries-scroll::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="flex gap-4 pb-4 must-tries-scroll" style={{ width: 'max-content' }}>
              {mustTryItems.map((item, index) => (
                <motion.div
                  key={item._id || item.id}
                  className="relative flex-shrink-0 rounded-xl overflow-hidden shadow-sm cursor-pointer"
                  style={{
                    width: 'calc((100vw - 3rem) / 2.5)',
                    minWidth: '140px',
                    maxWidth: '200px'
                  }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  whileHover={{ y: -8, scale: 1.05 }}
                >
                  <div className="relative h-48 sm:h-56 md:h-64 overflow-hidden">
                    <motion.div
                      className="absolute inset-0"
                      whileHover={{ scale: 1.15 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      <OptimizedImage
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full"
                        objectFit="cover"
                        sizes="(max-width: 640px) 40vw, 200px"
                        placeholder="blur"
                      />
                    </motion.div>
                    {/* White Subheading Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent p-3 sm:p-2 z-10">
                      <h4 className="text-white text-md sm:text-md font-bold text-start">
                        {item.name}
                      </h4>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Explore More Button */}
          {/* <div className="flex justify-center mt-6">
            <Button
              variant="ghost"
              className="px-6 py-2 text-sm font-semibold"
            >
              Explore More
            </Button>
          </div> */}
        </div>

        {/* Popular Restaurants Around You Section */}
        <div className="mb-6 mt-8 sm:mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                Popular Restaurants Around You
              </h3>
            </div>
          </div>

          {/* Filters */}
          <section className="py-1 mb-4">
            <div
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-1"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {/* Filter Button - Opens Modal */}
              <Button
                variant="outline"
                onClick={() => setIsFilterOpen(true)}
                className="h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 font-medium transition-all bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <SlidersHorizontal className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm font-bold text-black dark:text-white">Filters</span>
              </Button>

              {/* Filter Buttons */}
              {[
                { id: 'delivery-under-30', label: 'Under 30 mins' },
                { id: 'delivery-under-45', label: 'Under 45 mins' },
                { id: 'distance-under-1km', label: 'Under 1km', icon: MapPin },
                { id: 'distance-under-2km', label: 'Under 2km', icon: MapPin },
                { id: 'rating-35-plus', label: '3.5+ Rating' },
                { id: 'rating-4-plus', label: '4.0+ Rating' },
                { id: 'rating-45-plus', label: '4.5+ Rating' },
              ].map((filter) => {
                const Icon = filter.icon
                const isActive = activeFilters.has(filter.id)
                return (
                  <Button
                    key={filter.id}
                    variant="outline"
                    onClick={() => toggleFilter(filter.id)}
                    className={`h-7 sm:h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 transition-all font-medium ${isActive
                      ? 'bg-[#EB590E] text-white border border-[#EB590E] hover:bg-[#D94F0C]'
                      : 'bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                  >
                    {Icon && <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${isActive ? 'fill-white' : ''}`} />}
                    <span className="text-xs sm:text-sm font-bold text-black dark:text-white">{filter.label}</span>
                  </Button>
                )
              })}
            </div>
          </section>

          {/* Restaurant List with Menu Scroll - Under 250 style */}
          <div className="space-y-10 md:space-y-14">
            {filteredRestaurants.map((restaurant, index) => {
              const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
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
                    image: restaurant.image
                  })
                }
              }

              return (
                <div key={restaurant._id || restaurant.id} className="space-y-4">
                  {/* Restaurant Header */}
                  <div className="flex items-start justify-between">
                    <Link to={`/dining/${restaurant.diningSettings?.diningType || 'family-dining'}/${restaurantSlug}`} className="space-y-1 flex-1 group">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 group-hover:text-[#EB590E] transition-colors">
                          {restaurant.name}
                        </h3>
                        <div className="bg-green-600 text-white text-[10px] md:text-sm font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                          {restaurant.rating || '0.0'}
                          <Star className="h-2.5 w-2.5 md:h-3.5 md:w-3.5 fill-white" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] md:text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                        {restaurant.deliveryTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 md:h-4 md:w-4" />
                            {restaurant.deliveryTime}
                          </span>
                        )}
                        {restaurant.deliveryTime && restaurant.distance && <span>•</span>}
                        {restaurant.distance && <span>{restaurant.distance}</span>}
                        {restaurant.cuisine && <><span>•</span><span className="line-clamp-1">{restaurant.cuisine}</span></>}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleToggleFavorite}
                      className={`h-9 w-9 md:h-11 md:w-11 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${favorite
                        ? "border-red-500 bg-red-50 text-red-500"
                        : "border-gray-200 bg-white text-gray-400 hover:border-red-200 hover:text-red-400"
                        }`}
                    >
                      <Bookmark className={`h-4 w-4 md:h-5 md:w-5 ${favorite ? "fill-red-500 text-red-500" : ""}`} />
                    </Button>
                  </div>

                  {/* Horizontal Menu Scroll */}
                  <div className="relative">
                    <div
                      className="flex overflow-x-auto pb-4 gap-3 sm:gap-4 scrollbar-hide scroll-smooth"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                      {restaurant.menuItems && restaurant.menuItems.length > 0 ? (
                        restaurant.menuItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex-shrink-0 w-36 md:w-52 bg-white dark:bg-[#1a1a1a] rounded-[20px] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:-translate-y-2 group"
                            onClick={() => navigate(`/dining/${restaurant.diningSettings?.diningType || 'family-dining'}/${restaurantSlug}`)}
                          >
                            <div className="relative h-28 md:h-40 overflow-hidden">
                              <OptimizedImage
                                src={item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"}
                                alt={item.name}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              />
                              {item.isVeg !== undefined && (
                                <div className="absolute top-2 left-2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-md flex items-center justify-center border border-gray-100 shadow-sm">
                                  <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${item.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                                </div>
                              )}
                              {item.bestPrice && (
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 md:p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                                  <span className="text-white text-[10px] md:text-xs font-black uppercase tracking-widest">Best Price</span>
                                </div>
                              )}
                            </div>
                            <div className="p-2.5 md:p-4">
                              <h4 className="font-black text-gray-900 dark:text-gray-100 text-xs md:text-base line-clamp-1 mb-1 group-hover:text-[#EB590E] transition-colors">
                                {item.name}
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="text-gray-900 dark:text-gray-100 font-black text-xs md:text-lg">₹{item.price}</span>
                                {item.originalPrice > item.price && (
                                  <span className="text-gray-400 dark:text-gray-600 text-[10px] md:text-sm line-through font-bold">₹{item.originalPrice}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div
                          className="py-10 px-6 text-center text-gray-400 text-sm italic w-full bg-gray-50 dark:bg-gray-900/50 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 cursor-pointer hover:border-[#EB590E] transition-colors"
                          onClick={() => navigate(`/dining/${restaurant.diningSettings?.diningType || 'family-dining'}/${restaurantSlug}`)}
                        >
                          View full menu →
                        </div>
                      )}
                    </div>
                  </div>

                  {/* View Full Menu Button */}
                  <Link className="flex justify-start" to={`/dining/${restaurant.diningSettings?.diningType || 'family-dining'}/${restaurantSlug}`}>
                    <Button
                      variant="outline"
                      className="rounded-lg bg-gray-50 dark:bg-[#1a1a1a] hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white text-gray-700 border-gray-200 dark:border-gray-800 h-9 md:h-10 px-4 md:px-6 text-sm md:text-base"
                    >
                      View full menu <ArrowRight className="h-4 w-4 ml-2 text-gray-700 dark:text-gray-300" />
                    </Button>
                  </Link>
                </div>
              )
            })}

          </div>
        </div>
      </div>

      {/* Filter Modal */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-[100]" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsFilterOpen(false)}
          />

          {/* Modal Content */}
          <div className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-4xl bg-white dark:bg-[#1a1a1a] rounded-t-3xl md:rounded-3xl max-h-[85vh] md:max-h-[90vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4 md:py-5 border-b dark:border-gray-800">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">Filters and sorting</h2>
              <button
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                }}
                className="text-[#EB590E] font-medium text-sm md:text-base"
              >
                Clear all
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - Tabs */}
              <div className="w-24 sm:w-28 md:w-32 bg-gray-50 dark:bg-[#0a0a0a] border-r dark:border-gray-800 flex flex-col">
                {[
                  { id: 'sort', label: 'Sort By', icon: ArrowDownUp },
                  { id: 'time', label: 'Time', icon: Timer },
                  { id: 'rating', label: 'Rating', icon: Star },
                  { id: 'distance', label: 'Distance', icon: MapPin },
                  { id: 'price', label: 'Dish Price', icon: IndianRupee },
                  { id: 'cuisine', label: 'Cuisine', icon: UtensilsCrossed },
                ].map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeFilterTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveFilterTab(tab.id)}
                      className={`flex flex-col items-center gap-1 py-4 px-2 text-center relative transition-colors ${isActive ? 'bg-white dark:bg-[#1a1a1a] text-[#EB590E]' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#EB590E] rounded-r" />
                      )}
                      <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={1.5} />
                      <span className="text-xs md:text-sm font-medium leading-tight">{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Right Content Area - Scrollable */}
              <div ref={rightContentRef} className="flex-1 overflow-y-auto p-4 md:p-6">
                {/* Sort By Tab */}
                {activeFilterTab === 'sort' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white mb-4">Sort by</h3>
                    <div className="flex flex-col gap-3 md:gap-4">
                      {[
                        { id: null, label: 'Relevance' },
                        { id: 'rating-high', label: 'Rating: High to Low' },
                        { id: 'rating-low', label: 'Rating: Low to High' },
                      ].map((option) => (
                        <button
                          key={option.id || 'relevance'}
                          onClick={() => setSortBy(option.id)}
                          className={`px-4 md:px-5 py-3 md:py-4 rounded-xl border text-left transition-colors ${sortBy === option.id
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm md:text-base font-medium ${sortBy === option.id ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Tab */}
                {activeFilterTab === 'time' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delivery Time</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('delivery-under-30')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-30')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-30') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 30 mins</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('delivery-under-45')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('delivery-under-45')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Timer className={`h-6 w-6 ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('delivery-under-45') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 45 mins</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Rating Tab */}
                {activeFilterTab === 'rating' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Restaurant Rating</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('rating-35-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-35-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-35-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 3.5+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-4-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-4-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-4-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.0+</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('rating-45-plus')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('rating-45-plus')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <Star className={`h-6 w-6 ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E] fill-[#EB590E]' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className={`text-sm font-medium ${activeFilters.has('rating-45-plus') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Rated 4.5+</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Distance Tab */}
                {activeFilterTab === 'distance' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Distance</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => toggleFilter('distance-under-1km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-1km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-1km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 1 km</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('distance-under-2km')}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${activeFilters.has('distance-under-2km')
                          ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                          }`}
                      >
                        <MapPin className={`h-6 w-6 ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-600 dark:text-gray-400'}`} strokeWidth={1.5} />
                        <span className={`text-sm font-medium ${activeFilters.has('distance-under-2km') ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>Under 2 km</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Price Tab */}
                {activeFilterTab === 'price' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dish Price</h3>
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => toggleFilter('price-under-200')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-200')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-200') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹200</span>
                      </button>
                      <button
                        onClick={() => toggleFilter('price-under-500')}
                        className={`px-4 py-3 rounded-xl border text-left transition-colors ${activeFilters.has('price-under-500')
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-green-500'
                          }`}
                      >
                        <span className={`text-sm font-medium ${activeFilters.has('price-under-500') ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>Under ₹500</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Cuisine Tab */}
                {activeFilterTab === 'cuisine' && (
                  <div className="space-y-4 mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cuisine</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {['Continental', 'Italian', 'Asian', 'Indian', 'Chinese', 'American', 'Seafood', 'Cafe'].map((cuisine) => (
                        <button
                          key={cuisine}
                          onClick={() => setSelectedCuisine(selectedCuisine === cuisine ? null : cuisine)}
                          className={`px-4 py-3 rounded-xl border text-center transition-colors ${selectedCuisine === cuisine
                            ? 'border-[#EB590E] bg-[#FFF2EB] dark:bg-[#EB590E]/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-[#EB590E]'
                            }`}
                        >
                          <span className={`text-sm font-medium ${selectedCuisine === cuisine ? 'text-[#EB590E]' : 'text-gray-700 dark:text-gray-300'}`}>
                            {cuisine}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-5 border-t dark:border-gray-800 bg-white dark:bg-[#1a1a1a]">
              <button
                onClick={() => setIsFilterOpen(false)}
                className="flex-1 py-3 md:py-4 text-center font-semibold text-gray-700 dark:text-gray-300 text-sm md:text-base"
              >
                Close
              </button>
              <button
                onClick={() => setIsFilterOpen(false)}
                className={`flex-1 py-3 md:py-4 font-semibold rounded-xl transition-colors text-sm md:text-base ${activeFilters.size > 0 || sortBy || selectedCuisine
                  ? 'bg-[#EB590E] text-white hover:bg-[#D94F0C]'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
              >
                {activeFilters.size > 0 || sortBy || selectedCuisine
                  ? `Show ${filteredRestaurants.length} results`
                  : 'Show results'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}

