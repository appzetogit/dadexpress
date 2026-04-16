import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Star, Clock, Bookmark, BadgePercent, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { heroBannerAPI } from "@/lib/api"
import { toast } from "sonner"

// Import banner
import gourmetBanner from "@/assets/groumetpagebanner.png"

export default function Gourmet() {
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState(new Set())
  const [gourmetRestaurants, setGourmetRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch Gourmet restaurants from API
  useEffect(() => {
    const fetchGourmetRestaurants = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await heroBannerAPI.getGourmetRestaurants()
        const data = response?.data?.data

        if (data && data.restaurants) {
          setGourmetRestaurants(data.restaurants)
        } else {
          setGourmetRestaurants([])
        }
      } catch (err) {
        console.error('Error fetching Gourmet restaurants:', err)
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load Gourmet restaurants'
        setError(errorMessage)
        toast.error(errorMessage)
        setGourmetRestaurants([])
      } finally {
        setLoading(false)
      }
    }

    fetchGourmetRestaurants()
  }, [])

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Banner Section */}
      <div className="relative w-full overflow-hidden min-h-[25vh] md:min-h-[30vh]">
        {/* Back Button */}
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
          className="absolute top-4 left-4 md:top-6 md:left-6 z-20 w-10 h-10 md:w-12 md:h-12 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-800/80 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6 text-white" />
        </button>

        {/* Banner Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={gourmetBanner}
            alt="Gourmet Dining"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-10 space-y-4 md:space-y-6">
        <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div className="mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Premium Gourmet Restaurants</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Exquisite dining experiences delivered to your doorstep</p>
          </div>

          {/* Restaurant Count */}
          <p className="text-xs sm:text-sm font-semibold text-gray-400 dark:text-gray-500 tracking-widest uppercase">
            {loading ? '...' : gourmetRestaurants.length} GOURMET RESTAURANTS
          </p>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
              <p className="mt-4 text-gray-500 dark:text-gray-400">Loading Gourmet restaurants...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-red-500 dark:text-red-400 text-center">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
            </div>
          )}

          {/* Restaurant Sections */}
          {!loading && !error && (
            <div className="space-y-8 md:space-y-12">
              {gourmetRestaurants.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">No Gourmet restaurants available at the moment</p>
                </div>
              ) : (
                gourmetRestaurants.map((restaurant, index) => {
                  const restaurantSlug = restaurant.slug || restaurant.name?.toLowerCase().replace(/\s+/g, "-") || ""
                  const restaurantId = restaurant._id || restaurant.restaurantId || restaurant.id

                  return (
                    <div key={restaurantId} className="space-y-4">
                      {/* Restaurant Header */}
                      <Link to={`/user/restaurants/${restaurantSlug}`} className="block group">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {restaurant.name}
                              <div className="bg-green-600 text-white text-[10px] md:text-sm font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                                {restaurant.rating?.toFixed(1) || '0.0'}
                                <Star className="h-2.5 w-2.5 md:h-3 md:w-3 fill-white" />
                              </div>
                            </h2>
                            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 md:h-4 md:w-4" />
                                {restaurant.estimatedDeliveryTime || '25-30 mins'}
                              </span>
                              <span>•</span>
                              <span>{restaurant.distance || '1.2 km'}</span>
                              <span>•</span>
                              <span className="line-clamp-1">{restaurant.cuisine || 'Multi-cuisine'}</span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs md:text-sm border-2 hover:bg-[#EB590E] hover:text-white hover:border-[#EB590E] transition-all">
                            View Menu
                          </Button>
                        </div>
                      </Link>

                      {/* Horizontal Menu Scroll */}
                      <div className="relative">
                        <div className="flex overflow-x-auto pb-4 gap-3 scrollbar-hide scroll-smooth">
                          {restaurant.menuItems && restaurant.menuItems.length > 0 ? (
                            restaurant.menuItems.map((item) => (
                              <div 
                                key={item.id} 
                                className="flex-shrink-0 w-36 md:w-48 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => navigate(`/user/restaurants/${restaurantSlug}`)}
                              >
                                <div className="relative h-28 md:h-36 overflow-hidden">
                                  <img 
                                    src={item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop"} 
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                  {item.isVeg !== undefined && (
                                    <div className="absolute top-2 left-2 w-4 h-4 md:w-5 md:h-5 bg-white rounded-md flex items-center justify-center border border-gray-100">
                                      <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${item.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2 md:p-3">
                                  <h4 className="font-bold text-gray-900 dark:text-gray-100 text-xs md:text-sm line-clamp-1 mb-1">
                                    {item.name}
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-900 dark:text-gray-100 font-bold text-xs md:text-sm">
                                      ₹{item.price}
                                    </span>
                                    {item.originalPrice > item.price && (
                                      <span className="text-gray-400 dark:text-gray-600 text-[10px] md:text-xs line-through">
                                        ₹{item.originalPrice}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="py-8 px-4 text-center text-gray-400 text-sm italic w-full">
                              Looking for special dishes in this restaurant...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


