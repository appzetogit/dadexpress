import { useEffect, useMemo, useState, useRef } from "react"
import { Search, Loader2, IndianRupee, Percent, Calendar, Check, X, Plus } from "lucide-react"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"
import { useLocation, useNavigate } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"

const formatDateForInput = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    return ""
  }
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = String(date.getFullYear())
  return `${yyyy}-${mm}-${dd}`
}

export default function CouponCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const offer = location?.state?.offer || null
  const isEditMode = Boolean(offer)
  const startDateRef = useRef(null)
  const endDateRef = useRef(null)

  const [couponCode, setCouponCode] = useState("")
  const [discountPercent, setDiscountPercent] = useState("")
  const [minOrderValue, setMinOrderValue] = useState("")
  const [maxDiscountLimit, setMaxDiscountLimit] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [restaurantScope, setRestaurantScope] = useState("some") // 'all' or 'some'
  const [userScope, setUserScope] = useState("all")
  const [showOnCheckout, setShowOnCheckout] = useState(true)
  const [selectedRestaurants, setSelectedRestaurants] = useState(new Set())
  const [restaurants, setRestaurants] = useState([])
  const [isRestaurantsLoading, setIsRestaurantsLoading] = useState(false)
  const [restaurantSearch, setRestaurantSearch] = useState("")

  // Fetch restaurants from backend
  useEffect(() => {
    const fetchRestaurants = async () => {
      setIsRestaurantsLoading(true)
      try {
        const response = await adminAPI.getRestaurants({ limit: 1000 }) // Get all restaurants
        if (response.data?.success) {
          setRestaurants(response.data.data.restaurants || [])
        }
      } catch (error) {
        console.error("Failed to fetch restaurants:", error)
        toast.error("Failed to load restaurants")
      } finally {
        setIsRestaurantsLoading(false)
      }
    }
    fetchRestaurants()
  }, [])

  useEffect(() => {
    if (!offer) return

    setCouponCode(offer.couponCode || offer.code || "")
    setDiscountPercent(String(offer.discountPercentage ?? offer.discountPercent ?? offer.discount ?? ""))
    setMinOrderValue(String(offer.minOrderValue ?? offer.minOrder ?? offer.minimumOrderValue ?? ""))
    setMaxDiscountLimit(String(offer.maxDiscountLimit ?? offer.maxDiscount ?? offer.maximumDiscountLimit ?? ""))
    setStartDate(formatDateForInput(offer.startDate))
    setEndDate(formatDateForInput(offer.endDate))

    const scope = offer.userScope ?? offer.user_scope
    if (scope) setUserScope(String(scope))

    const parseBoolean = (value) => {
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (["false", "0", "no", "hidden"].includes(normalized)) return false
        if (["true", "1", "yes", "visible"].includes(normalized)) return true
      }
      return Boolean(value)
    }

    const checkout =
      offer.showOnCheckout ??
      offer.show_on_checkout ??
      offer.checkoutVisible ??
      offer.checkout_visible ??
      offer.checkoutVisibility ??
      offer.checkout_visibility
    if (checkout !== undefined && checkout !== null) setShowOnCheckout(parseBoolean(checkout))
  }, [offer])

  useEffect(() => {
    if (offer && restaurants.length > 0) {
      const restaurant = offer.restaurantName ?? offer.restaurant
      if (restaurant) {
        setRestaurantScope("some")
        setSelectedRestaurants(new Set([String(restaurant)]))
      }
    }
  }, [offer, restaurants])

  const restaurantOptions = useMemo(() => {
    return restaurants.map((r) => r.name)
  }, [restaurants])

  const filteredRestaurants = useMemo(() => {
    return restaurantOptions.filter((name) =>
      name.toLowerCase().includes(restaurantSearch.toLowerCase()),
    )
  }, [restaurantOptions, restaurantSearch])

  const toggleRestaurant = (restaurantName) => {
    setSelectedRestaurants((prev) => {
      const next = new Set(prev)
      if (next.has(restaurantName)) {
        next.delete(restaurantName)
      } else {
        next.add(restaurantName)
      }
      return next
    })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Offers & Coupons</h1>
            <button
              type="button"
              onClick={() => navigate("/admin/coupons")}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-500 text-white hover:bg-slate-600 flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              toast.info("Coupon submission functionality is coming soon!")
            }}
          >
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">Coupon Code</label>
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="E.g. SUMMER50"
                    className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">Discount %</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      placeholder="50"
                      className="w-full pl-10 pr-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">Min Order Value</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={minOrderValue}
                      onChange={(e) => setMinOrderValue(e.target.value)}
                      placeholder="200"
                      className="w-full pl-10 pr-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>
 
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">Max Discount Limit</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={maxDiscountLimit}
                      onChange={(e) => setMaxDiscountLimit(e.target.value)}
                      placeholder="100"
                      className="w-full pl-10 pr-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                    <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">Start Date</label>
                  <div className="relative">
                    <input
                      ref={startDateRef}
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pr-12 px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 [appearance:textfield] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <Calendar
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => startDateRef.current?.showPicker()}
                    />
                  </div>
                </div>
 
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase">End Date</label>
                  <div className="relative">
                    <input
                      ref={endDateRef}
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pr-12 px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 [appearance:textfield] [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                    <Calendar
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 cursor-pointer hover:text-blue-600 transition-colors"
                      onClick={() => endDateRef.current?.showPicker()}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                    Restaurant Scope
                  </p>

                  <div className="flex items-center gap-6 mb-5">
                    <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="restaurant-scope"
                        value="some"
                        checked={restaurantScope === "some"}
                        onChange={() => setRestaurantScope("some")}
                        className="w-4 h-4 accent-blue-600"
                      />
                      Some restaurants
                    </label>
                    <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="restaurant-scope"
                        value="all"
                        checked={restaurantScope === "all"}
                        onChange={() => setRestaurantScope("all")}
                        className="w-4 h-4 accent-blue-600"
                      />
                      All restaurants
                    </label>
                  </div>

                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search restaurants..."
                      className="pl-10 h-11 border-slate-200"
                      value={restaurantSearch}
                      onChange={(e) => setRestaurantSearch(e.target.value)}
                      disabled={restaurantScope === "all"}
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-inner">
                    <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
                      {isRestaurantsLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <Loader2 className="h-8 w-8 animate-spin mb-3 text-blue-600" />
                          <p className="text-sm">Loading restaurants...</p>
                        </div>
                      ) : filteredRestaurants.length > 0 ? (
                        filteredRestaurants.map((restaurant) => {
                          const isSelected = selectedRestaurants.has(restaurant)
                          const isDisabled = restaurantScope === "all"
                          return (
                            <label
                              key={restaurant}
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${
                                isSelected
                                  ? "bg-blue-50 border-blue-200"
                                  : "hover:bg-slate-50 border-transparent"
                              } ${isDisabled ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                            >
                              <Checkbox
                                id={`restaurant-${restaurant}`}
                                checked={isSelected}
                                disabled={isDisabled}
                                onCheckedChange={() => toggleRestaurant(restaurant)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                              />
                              <span className={`text-sm font-medium ${isSelected ? "text-blue-900" : "text-slate-700"} capitalize`}>
                                {restaurant}
                              </span>
                            </label>
                          )
                        })
                      ) : (
                        <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg">
                          <p className="text-sm">No restaurants found</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">User Scope</p>

                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: "all", label: "All users" },
                        { id: "first-time", label: "First-time users" },
                        { id: "shared", label: "Shared app users" },
                      ].map((scope) => (
                        <label
                          key={scope.id}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                            userScope === scope.id
                              ? "bg-blue-50 border-blue-200 text-blue-900"
                              : "bg-white border-slate-100 text-slate-700 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="user-scope"
                            value={scope.id}
                            checked={userScope === scope.id}
                            onChange={() => setUserScope(scope.id)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-sm font-semibold">{scope.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">Visibility</p>
                    <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all border ${
                      showOnCheckout 
                      ? "bg-green-50 border-green-200 text-green-900"
                      : "bg-white border-slate-100 text-slate-600"
                    }`}>
                      <Checkbox
                        id="show-on-checkout"
                        checked={showOnCheckout}
                        onCheckedChange={setShowOnCheckout}
                        className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                      />
                      <span className="text-sm font-semibold">Show this coupon on checkout page</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => navigate("/admin/coupons")}
                  className="px-6 py-3 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-200 active:scale-95 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  {isEditMode ? "Update Coupon" : "Create Coupon"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
