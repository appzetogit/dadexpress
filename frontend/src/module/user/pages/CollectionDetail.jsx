import { useState, useEffect } from "react"
import { Link, useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Trash2, Heart, Star, Clock, MapPin } from "lucide-react"
import AnimatedPage from "../components/AnimatedPage"
import ScrollReveal from "../components/ScrollReveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useProfile } from "../context/ProfileContext"

export default function CollectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getFavorites, removeFavorite } = useProfile()
  
  const [collection, setCollection] = useState({
    id: id,
    name: "My Collection",
    dishes: 0,
    restaurants: 0,
    items: []
  })

  const favorites = getFavorites()
  const [restaurantMenus, setRestaurantMenus] = useState({})
  
  useEffect(() => {
    setCollection(prev => ({
      ...prev,
      name: `Collection ${id}`,
      items: favorites,
      restaurants: favorites.length,
      dishes: 0
    }))
  }, [id, favorites])

  // Fetch menus for restaurants in collection
  useEffect(() => {
    collection.items.forEach(async (restaurant) => {
      const resId = restaurant._id || restaurant.restaurantId || restaurant.id
      if (resId && !restaurantMenus[resId]) {
        try {
          const { restaurantAPI } = await import("@/lib/api")
          const response = await restaurantAPI.getMenuByRestaurantId(resId)
          const sections = response?.data?.data?.sections || []
          const items = []
          sections.forEach(section => {
            if (section.isEnabled !== false) {
              (section.items || []).forEach(item => {
                if (item.isAvailable !== false && items.length < 15) {
                  items.push({
                    id: item.id || item._id,
                    name: item.name,
                    price: item.price,
                    originalPrice: item.originalPrice || item.price,
                    image: item.image || (item.images && item.images.length > 0 ? item.images[0] : ""),
                    isVeg: item.foodType === 'Veg'
                  })
                }
              })
            }
          })
          setRestaurantMenus(prev => ({ ...prev, [resId]: items }))
        } catch (err) {
          console.warn(`Failed to fetch menu for restaurant ${resId}`)
        }
      }
    })
  }, [collection.items])

  const handleRemoveItem = (e, slug) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Remove this restaurant from collection?")) {
      removeFavorite(slug)
      setCollection(prev => ({
        ...prev,
        items: prev.items.filter(item => item.slug !== slug),
        restaurants: prev.restaurants - 1
      }))
    }
  }

  if (collection.items.length === 0) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <ScrollReveal>
            <div className="flex items-center gap-3 sm:gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold">{collection.name}</h1>
            </div>
          </ScrollReveal>
          <Card>
            <CardContent className="py-12 text-center">
              <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg mb-4">This collection is empty</p>
              <Link to="/user">
                <Button className="bg-gradient-to-r bg-primary-orange hover:opacity-90 text-white">
                  Explore Restaurants
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <ScrollReveal>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold">{collection.name}</h1>
                <p className="text-muted-foreground mt-1">
                  {collection.restaurants} {collection.restaurants === 1 ? "restaurant" : "restaurants"}
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>

        <div className="space-y-8 md:space-y-12 mt-4">
          {collection.items.map((restaurant, index) => {
            const resId = restaurant._id || restaurant.restaurantId || restaurant.id
            const menuItems = restaurantMenus[resId] || []

            return (
              <div key={restaurant.slug} className="space-y-4">
                {/* Restaurant Header */}
                <div className="flex items-start justify-between">
                  <Link to={`/user/restaurants/${restaurant.slug}`} className="space-y-1">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      {restaurant.name}
                      <div className="bg-green-600 text-white text-[10px] md:text-sm font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                        {restaurant.rating || '4.5'}
                        <Star className="h-2.5 w-2.5 md:h-3 md:w-3 fill-white" />
                      </div>
                    </h2>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 md:h-4 md:w-4" />
                        {restaurant.deliveryTime || '25-30 mins'}
                      </span>
                      <span>•</span>
                      <span>{restaurant.distance || '2.5 km'}</span>
                    </div>
                  </Link>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full bg-white/90 backdrop-blur-sm hover:bg-white text-red-500"
                      onClick={(e) => handleRemoveItem(e, restaurant.slug)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                    <Link to={`/user/restaurants/${restaurant.slug}`}>
                      <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs md:text-sm border-2">
                        View Menu
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Horizontal Menu Scroll */}
                <div className="relative">
                  <div className="flex overflow-x-auto pb-4 gap-3 scrollbar-hide scroll-smooth">
                    {menuItems.length > 0 ? (
                      menuItems.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex-shrink-0 w-36 md:w-48 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => navigate(`/user/restaurants/${restaurant.slug}`)}
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
                      <div className="flex gap-3">
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} className="flex-shrink-0 w-36 md:w-48 h-44 bg-gray-50 dark:bg-gray-800/50 animate-pulse rounded-2xl" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AnimatedPage>
  )
}
