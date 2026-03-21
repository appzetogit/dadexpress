import { useEffect, useMemo, useState } from "react"
import { Calendar, Plus } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

const formatDateForInput = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = String(date.getFullYear())
  return `${dd}-${mm}-${yyyy}`
}

export default function CouponCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const offer = location?.state?.offer || null
  const isEditMode = Boolean(offer)

  const [couponCode, setCouponCode] = useState("")
  const [discountPercent, setDiscountPercent] = useState("")
  const [minOrderValue, setMinOrderValue] = useState("")
  const [maxDiscountLimit, setMaxDiscountLimit] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [restaurantScope, setRestaurantScope] = useState("some")
  const [userScope, setUserScope] = useState("all")
  const [showOnCheckout, setShowOnCheckout] = useState(true)
  const [selectedRestaurants, setSelectedRestaurants] = useState(() => new Set())

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

    const restaurant = offer.restaurantName ?? offer.restaurant
    if (restaurant) {
      setRestaurantScope("some")
      setSelectedRestaurants(new Set([String(restaurant)]))
    }
  }, [offer])

  const restaurantOptions = useMemo(
    () => [
      "testst11232",
      "Tester restaurant",
      "THE PERCH",
      "Restaurant 3165",
      "sayaji",
      "Wonder Resturant (Hotel Bivab)",
    ],
    []
  )

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Restaurant Offers & Coupons</h1>
            <button
              type="button"
              onClick={() => navigate("/admin/coupons")}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Close
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Coupon code"
                  className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="Discount %"
                  className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={minOrderValue}
                  onChange={(e) => setMinOrderValue(e.target.value)}
                  placeholder="Min order value"
                  className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                <input
                  type="number"
                  inputMode="numeric"
                  value={maxDiscountLimit}
                  onChange={(e) => setMaxDiscountLimit(e.target.value)}
                  placeholder="Max discount limit (optional)"
                  className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />

                <div className="relative">
                  <input
                    type="text"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="dd-mm-yyyy"
                    className="w-full pr-12 px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="dd-mm-yyyy"
                    className="w-full pr-12 px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Restaurant Scope
                  </p>

                  <div className="flex items-center gap-6 mb-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="restaurant-scope"
                        value="some"
                        checked={restaurantScope === "some"}
                        onChange={() => setRestaurantScope("some")}
                        className="accent-red-600"
                      />
                      Some restaurants
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="restaurant-scope"
                        value="all"
                        checked={restaurantScope === "all"}
                        onChange={() => setRestaurantScope("all")}
                        className="accent-red-600"
                      />
                      All restaurants
                    </label>
                  </div>

                  <div className="h-44 overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-2">
                    {restaurantOptions.map((name) => {
                      const checked = selectedRestaurants.has(name)
                      return (
                        <label key={name} className="flex items-center gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedRestaurants((prev) => {
                                const next = new Set(prev)
                                if (next.has(name)) next.delete(name)
                                else next.add(name)
                                return next
                              })
                            }}
                            className="accent-red-600"
                            disabled={restaurantScope === "all"}
                          />
                          <span className={restaurantScope === "all" ? "text-slate-400" : ""}>{name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">User Scope</p>

                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="user-scope"
                        value="all"
                        checked={userScope === "all"}
                        onChange={() => setUserScope("all")}
                        className="accent-red-600"
                      />
                      All users
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="user-scope"
                        value="first-time"
                        checked={userScope === "first-time"}
                        onChange={() => setUserScope("first-time")}
                        className="accent-red-600"
                      />
                      First-time users
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="user-scope"
                        value="shared"
                        checked={userScope === "shared"}
                        onChange={() => setUserScope("shared")}
                        className="accent-red-600"
                      />
                      Shared app users
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 mt-4">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Checkout Visibility</p>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={showOnCheckout}
                    onChange={(e) => setShowOnCheckout(e.target.checked)}
                    className="accent-red-600"
                  />
                  Show this coupon on checkout
                </label>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  className="px-5 py-3 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
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
