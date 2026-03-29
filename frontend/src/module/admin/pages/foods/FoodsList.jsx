import { useState, useMemo, useEffect } from "react"
import { Search, Trash2, Loader2, Eye, X } from "lucide-react"
import { adminAPI, restaurantAPI } from "@/lib/api"
import apiClient from "@/lib/api"
import { toast } from "sonner"

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [foods, setFoods] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [viewingFood, setViewingFood] = useState(null)

  // Fetch all foods from all restaurants
  useEffect(() => {
    const fetchAllFoods = async () => {
      try {
        setLoading(true)
        
        // First, fetch all restaurants
        const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000 })
        const restaurants = restaurantsResponse?.data?.data?.restaurants || 
                          restaurantsResponse?.data?.restaurants || 
                          []
        
        if (restaurants.length === 0) {
          setFoods([])
          setLoading(false)
          return
        }

        // Fetch menu for each restaurant and extract all food items
        const allFoods = []
        
        for (const restaurant of restaurants) {
          try {
            const restaurantId = restaurant._id || restaurant.id
            const menuResponse = await restaurantAPI.getMenuByRestaurantId(restaurantId)
            const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu
            
            if (menu && menu.sections) {
              // Extract items from sections and subsections
              menu.sections.forEach((section) => {
                // Items directly in section
                if (section.items && Array.isArray(section.items)) {
                  section.items.forEach((item) => {
                    allFoods.push({
                      id: item.id || `${restaurantId}-${section.id}-${item.name}`,
                      _id: item._id,
                      name: item.name || "Unnamed Item",
                      image: item.image || item.images?.[0] || "https://via.placeholder.com/40",
                      priority: "Normal", // Default priority
                      status: item.isAvailable !== false && item.approvalStatus !== 'rejected',
                      restaurantId: restaurantId,
                      restaurantName: restaurant.name || "Unknown Restaurant",
                      sectionName: section.name || "Unknown Section",
                      price: item.price || 0,
                      foodType: item.foodType || "Non-Veg",
                      approvalStatus: item.approvalStatus || 'pending',
                      originalItem: item // Keep original item data
                    })
                  })
                }
                
                // Items in subsections
                if (section.subsections && Array.isArray(section.subsections)) {
                  section.subsections.forEach((subsection) => {
                    if (subsection.items && Array.isArray(subsection.items)) {
                      subsection.items.forEach((item) => {
                        allFoods.push({
                          id: item.id || `${restaurantId}-${section.id}-${subsection.id}-${item.name}`,
                          _id: item._id,
                          name: item.name || "Unnamed Item",
                          image: item.image || item.images?.[0] || "https://via.placeholder.com/40",
                          priority: "Normal", // Default priority
                          status: item.isAvailable !== false && item.approvalStatus !== 'rejected',
                          restaurantId: restaurantId,
                          restaurantName: restaurant.name || "Unknown Restaurant",
                          sectionName: section.name || "Unknown Section",
                          subsectionName: subsection.name || "Unknown Subsection",
                          price: item.price || 0,
                          foodType: item.foodType || "Non-Veg",
                          approvalStatus: item.approvalStatus || 'pending',
                          originalItem: item // Keep original item data
                        })
                      })
                    }
                  })
                }
              })
            }
          } catch (error) {
            // Silently skip restaurants that don't have menus or have errors
            console.warn(`Failed to fetch menu for restaurant ${restaurant._id || restaurant.id}:`, error.message)
          }
        }
        
        setFoods(allFoods)
      } catch (error) {
        console.error("Error fetching foods:", error)
        toast.error("Failed to load foods from restaurants")
        setFoods([])
      } finally {
        setLoading(false)
      }
    }

    fetchAllFoods()
  }, [])

  // Format ID to FOOD format (e.g., FOOD519399)
  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "1768285554154-0.703896654519399" or "item-1768285554154-0.703896654519399"
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    // Get the last part and extract digits
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      // Extract only digits from the last part
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        // Get last 6 digits from all digits found
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `FOOD${lastDigits}`
  }

  const filteredFoods = useMemo(() => {
    let result = [...foods]
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(food =>
        food.name.toLowerCase().includes(query) ||
        food.id.toString().includes(query) ||
        food.restaurantName?.toLowerCase().includes(query)
      )
    }

    return result
  }, [foods, searchQuery])

  const handleDelete = async (id) => {
    const food = foods.find(f => f.id === id)
    if (!food) return

    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      
      // Get the restaurant's menu
      const menuResponse = await restaurantAPI.getMenuByRestaurantId(food.restaurantId)
      const menu = menuResponse?.data?.data?.menu || menuResponse?.data?.menu
      
      if (!menu || !menu.sections) {
        throw new Error("Menu not found")
      }

      // Find and remove the item from the menu structure
      let itemRemoved = false
      const updatedSections = menu.sections.map(section => {
        // Check items in section
        if (section.items && Array.isArray(section.items)) {
          const itemIndex = section.items.findIndex(item => 
            String(item.id) === String(food.id) || 
            String(item.id) === String(food.originalItem?.id)
          )
          if (itemIndex !== -1) {
            section.items.splice(itemIndex, 1)
            itemRemoved = true
          }
        }
        
        // Check items in subsections
        if (section.subsections && Array.isArray(section.subsections)) {
          section.subsections = section.subsections.map(subsection => {
            if (subsection.items && Array.isArray(subsection.items)) {
              const itemIndex = subsection.items.findIndex(item => 
                String(item.id) === String(food.id) || 
                String(item.id) === String(food.originalItem?.id)
              )
              if (itemIndex !== -1) {
                subsection.items.splice(itemIndex, 1)
                itemRemoved = true
              }
            }
            return subsection
          })
        }
        
        return section
      })

      if (!itemRemoved) {
        throw new Error("Item not found in menu")
      }

      // Update menu in backend
      try {
        // Use the admin API endpoint which is authorized for admins
        const response = await adminAPI.updateRestaurantMenu(
          food.restaurantId, 
          { sections: updatedSections }
        )
        
        if (!response.data || !response.data.success) {
          throw new Error(response.data?.message || "Failed to update menu")
        }
      } catch (apiError) {
        console.error("API Error during delete:", apiError)
        throw new Error(apiError.response?.data?.message || apiError.message || "Failed to update menu")
      }

      // Remove from local state
      setFoods(foods.filter(f => f.id !== id))
      toast.success("Food item deleted successfully")
    } catch (error) {
      console.error("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {filteredFoods.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading foods from restaurants...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredFoods.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No food items match your search</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFoods.map((food, index) => (
                  <tr
                    key={food.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={food.image}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/40"
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{food.name}</span>
                        <span className="text-xs text-slate-500">ID #{formatFoodId(food.id)}</span>
                        {food.restaurantName && (
                          <span className="text-xs text-slate-400 mt-0.5">
                            {food.restaurantName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setViewingFood(food)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(food.id)}
                          disabled={deleting}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Food Details Modal */}
      {viewingFood && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Food Details</h3>
              <button 
                onClick={() => setViewingFood(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <img
                    src={viewingFood.image}
                    alt={viewingFood.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = "https://via.placeholder.com/80"
                    }}
                  />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900">{viewingFood.name}</h4>
                  <p className="text-sm text-slate-500 font-medium tracking-wide">
                    ID #{formatFoodId(viewingFood.id)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      viewingFood.foodType === 'Veg' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {viewingFood.foodType}
                    </span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {viewingFood.sectionName}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Price</p>
                    <p className="text-lg font-bold text-slate-900">₹{viewingFood.price}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${viewingFood.status ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                      <p className="text-sm font-bold text-slate-700">{viewingFood.status ? 'Active' : 'Inactive'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Restaurant Information</p>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 font-medium">Name:</span>
                    <span className="text-xs font-bold text-slate-900">{viewingFood.restaurantName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-medium">Location:</span>
                    <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">{viewingFood.originalItem?.location || "N/A"}</span>
                  </div>
                </div>

                {viewingFood.originalItem?.description && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                    <p className="text-xs text-slate-600 leading-relaxed italic">{viewingFood.originalItem.description}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={() => setViewingFood(null)}
                className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-100 transition-colors shadow-sm"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
