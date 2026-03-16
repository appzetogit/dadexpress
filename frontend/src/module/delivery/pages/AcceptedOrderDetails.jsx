import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { 
  ArrowLeft,
  MessageCircle,
  Phone,
  MapPin,
  Utensils,
  ChefHat,
  DollarSign,
  Home,
  FileText,
  UtensilsCrossed,
  User,
  Loader2
} from "lucide-react"
import { 
  getDeliveryOrderStatus, 
  getDeliveryStatusMessage,
  saveDeliveryOrderStatus,
  normalizeDeliveryStatus,
  DELIVERY_ORDER_STATUS
} from "../utils/deliveryOrderStatus"
import { 
  getDeliveryOrderPaymentStatus 
} from "../utils/deliveryWalletState"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"

export default function AcceptedOrderDetails() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [orderStatus, setOrderStatus] = useState(() => getDeliveryOrderStatus(orderId))
  const [paymentStatus, setPaymentStatus] = useState(() => getDeliveryOrderPaymentStatus(orderId))
  const [activeOrderInfo, setActiveOrderInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [orderData, setOrderData] = useState(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const mapBackendStatusToUiStatus = (status) => {
    if (!status) return null
    const normalized = String(status).toLowerCase().trim()
    if (normalized === "accepted" || normalized === "confirmed") return DELIVERY_ORDER_STATUS.ACCEPTED
    if (normalized === "picked_up" || normalized === "picked up" || normalized === "preparing" || normalized === "ready") return DELIVERY_ORDER_STATUS.PICKED_UP
    if (normalized === "on_the_way" || normalized === "out_for_delivery" || normalized === "on the way") return DELIVERY_ORDER_STATUS.ON_THE_WAY
    if (normalized === "delivered" || normalized === "completed") return DELIVERY_ORDER_STATUS.DELIVERED
    if (normalized === "cancelled" || normalized === "canceled") return DELIVERY_ORDER_STATUS.CANCELLED
    return null
  }

  // Fetch order details from database
  useEffect(() => {
    const fetchOrderDetails = async () => {
      if (!orderId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await deliveryAPI.getOrderDetails(orderId)
        
        if (response?.data?.success && response.data.data?.order) {
          const order = response.data.data.order
          setOrderData(order)
          const backendStatus = mapBackendStatusToUiStatus(order.status || order.deliveryState?.currentPhase)
          if (backendStatus) {
            setOrderStatus(backendStatus)
            saveDeliveryOrderStatus(orderId, backendStatus)
          }
          
          // Also update activeOrderInfo for backward compatibility
          setActiveOrderInfo({
            orderId: order.orderId || order._id,
            _id: order._id,
            customerName: order.userId?.name || order.userId?.fullName || "Customer",
            customerAddress: order.address?.formattedAddress || order.address?.address || "Customer address",
            customerPhone: order.userId?.phone,
            customerLat: order.address?.location?.coordinates?.[1] || order.address?.location?.lat,
            customerLng: order.address?.location?.coordinates?.[0] || order.address?.location?.lng,
            name: order.restaurantId?.name || "Restaurant",
            address: order.restaurantId?.address || order.restaurantId?.location?.formattedAddress || "Restaurant address",
            lat: order.restaurantId?.location?.coordinates?.[1] || order.restaurantId?.location?.lat,
            lng: order.restaurantId?.location?.coordinates?.[0] || order.restaurantId?.location?.lng,
            phone: order.restaurantId?.phone || order.restaurantId?.ownerPhone,
            ownerPhone: order.restaurantId?.ownerPhone,
            restaurantPhone: order.restaurantId?.phone,
            items: order.items || [],
            total: order.pricing?.total || order.total || 0,
            paymentMethod: order.paymentMethod || order.payment?.method || "cash",
            status: order.status
          })
        } else {
          // Fallback to localStorage if API fails
          try {
            const saved = localStorage.getItem("deliveryActiveOrder")
            if (saved) {
              const parsed = JSON.parse(saved)
              const storedOrderId =
                parsed.orderId ||
                parsed.restaurantInfo?.orderMongoId ||
                parsed.restaurantInfo?.orderId ||
                parsed.restaurantInfo?.id

              if (storedOrderId && storedOrderId === orderId) {
                setActiveOrderInfo(parsed.restaurantInfo || null)
              }
            }
          } catch (e) {
            console.error("Failed to parse deliveryActiveOrder from localStorage", e)
          }
        }
      } catch (error) {
        console.error("Error fetching order details:", error)
        toast.error("Failed to load order details")
        
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem("deliveryActiveOrder")
          if (saved) {
            const parsed = JSON.parse(saved)
            const storedOrderId =
              parsed.orderId ||
              parsed.restaurantInfo?.orderMongoId ||
              parsed.restaurantInfo?.orderId ||
              parsed.restaurantInfo?.id

            if (storedOrderId && storedOrderId === orderId) {
              setActiveOrderInfo(parsed.restaurantInfo || null)
            }
          }
        } catch (e) {
          console.error("Failed to parse deliveryActiveOrder from localStorage", e)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchOrderDetails()
  }, [orderId])

  // Listen for order status updates
  useEffect(() => {
    const handleStatusUpdate = () => {
      setOrderStatus(getDeliveryOrderStatus(orderId))
      setPaymentStatus(getDeliveryOrderPaymentStatus(orderId))
    }

    handleStatusUpdate()

    window.addEventListener('deliveryOrderStatusUpdated', handleStatusUpdate)
    window.addEventListener('deliveryWalletStateUpdated', handleStatusUpdate)
    window.addEventListener('storage', handleStatusUpdate)

    return () => {
      window.removeEventListener('deliveryOrderStatusUpdated', handleStatusUpdate)
      window.removeEventListener('deliveryWalletStateUpdated', handleStatusUpdate)
      window.removeEventListener('storage', handleStatusUpdate)
    }
  }, [orderId])

  const statusMessage = getDeliveryStatusMessage(orderStatus)

  const getOrderIdForApi = () => {
    return orderData?._id || orderData?.orderId || activeOrderInfo?._id || activeOrderInfo?.orderId || orderId
  }

  const handleMarkPickedUp = async () => {
    const apiOrderId = getOrderIdForApi()
    if (!apiOrderId || statusUpdating) return
    try {
      setStatusUpdating(true)
      await deliveryAPI.confirmReachedPickup(apiOrderId)
      saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.PICKED_UP)
      setOrderStatus(DELIVERY_ORDER_STATUS.PICKED_UP)
      toast.success("Order marked as picked up")
    } catch (error) {
      console.error("Error marking order as picked up:", error)
      toast.error("Failed to update order status")
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleMarkOnTheWay = async () => {
    const apiOrderId = getOrderIdForApi()
    if (!apiOrderId || statusUpdating) return
    try {
      setStatusUpdating(true)
      await deliveryAPI.confirmReachedDrop(apiOrderId)
      saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.ON_THE_WAY)
      setOrderStatus(DELIVERY_ORDER_STATUS.ON_THE_WAY)
      toast.success("Order marked as on the way")
    } catch (error) {
      console.error("Error marking order as on the way:", error)
      toast.error("Failed to update order status")
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleMarkDelivered = async () => {
    const apiOrderId = getOrderIdForApi()
    if (!apiOrderId || statusUpdating) return
    try {
      setStatusUpdating(true)
      await deliveryAPI.completeDelivery(apiOrderId)
      saveDeliveryOrderStatus(orderId, DELIVERY_ORDER_STATUS.DELIVERED)
      setOrderStatus(DELIVERY_ORDER_STATUS.DELIVERED)
      // Notify wallet listeners so earnings/pocket cards refresh immediately.
      window.dispatchEvent(new Event("deliveryWalletStateUpdated"))
      // Remove from activeOrder when delivered
      const activeOrder = localStorage.getItem('activeOrder')
      if (activeOrder) {
        const activeOrderData = JSON.parse(activeOrder)
        if (activeOrderData.orderId === orderId) {
          localStorage.removeItem('activeOrder')
          window.dispatchEvent(new CustomEvent('activeOrderUpdated'))
        }
      }
      toast.success("Order marked as delivered")
    } catch (error) {
      console.error("Error marking order as delivered:", error)
      toast.error("Failed to update order status")
    } finally {
      setStatusUpdating(false)
    }
  }

  const normalizePhoneNumber = (value) => {
    if (value === null || value === undefined) return ""
    const text = String(value).trim()
    if (!text) return ""
    return text.replace(/[^\d+]/g, "")
  }

  const toValidCoord = (value) => {
    const coord = Number(value)
    return Number.isFinite(coord) ? coord : null
  }

  const openNavigationMap = ({ lat, lng, address }) => {
    const safeLat = toValidCoord(lat)
    const safeLng = toValidCoord(lng)

    if (safeLat !== null && safeLng !== null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${safeLat},${safeLng}&travelmode=bicycling`, "_blank")
      return true
    }

    if (address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank")
      return true
    }

    return false
  }

  // Helper to safely map items coming from backend into UI-friendly shape
  const normalizedItems = (() => {
    const rawItems = activeOrderInfo?.items
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return null
    }

    return rawItems.map((item, index) => {
      const name =
        item.name ||
        item.itemName ||
        item.productName ||
        item.menuItemName ||
        "Item"

      const price =
        typeof item.price === "number"
          ? item.price
          : typeof item.totalPrice === "number"
          ? item.totalPrice
          : typeof item.amount === "number"
          ? item.amount
          : 0

      const quantity =
        item.quantity ?? item.qty ?? item.count ?? item.itemQuantity ?? 1

      const isVeg =
        item.isVeg ?? item.veg ?? item.isVegetarian ?? item.itemType === "veg"

      return {
        id: item.id || item._id || index + 1,
        name,
        price,
        variation:
          item.variation ||
          item.variant ||
          item.size ||
          item.description ||
          "Default",
        quantity,
        type: isVeg ? "Veg" : "Non Veg",
        image:
          item.image ||
          item.photo ||
          item.imageUrl ||
          "https://images.unsplash.com/photo-1604908176997-1251884b08a6?w=100&h=100&fit=crop&q=80"
      }
    })
  })()

  // Build order data – prefer real backend data, fall back to design/demo values
  const buildOrderData = () => {
    if (!orderData && !activeOrderInfo) {
      return {
        id: orderId || "100102",
        status: orderStatus,
        deliveryTime: "1 - 5 Min",
        customer: {
          name: "Customer",
          address: "Customer address",
          image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=100&h=100&fit=crop&q=80"
        },
        restaurant: {
          name: "Hungry Puppets",
          address: "House: 00, Road: 00, Tes..",
          rating: 3.3
        },
        items: [],
        cutlery: "No",
        paymentMethod: {
          status: paymentStatus,
          method: "Cash"
        },
        billing: {
          subtotal: 0,
          deliverymanTips: 0.0,
          total: 0
        },
        statusMessage: statusMessage.message,
        statusDescription: statusMessage.description
      }
    }

    const order = orderData || {}
    const info = activeOrderInfo || {}
    
    // Calculate delivery time estimate
    const eta = order.eta || {}
    const minEta = eta.min || eta.minETA || 1
    const maxEta = eta.max || eta.maxETA || 5
    const deliveryTime = `${minEta} - ${maxEta} Min`

    return {
      id: order.orderId || order._id || orderId || info.orderId || info._id || "100102",
      status: orderStatus,
      deliveryTime,
      customer: {
        name: order.userId?.name || order.userId?.fullName || info.customerName || "Customer",
        address: order.address?.formattedAddress || order.address?.address || info.customerAddress || "Customer address",
        phone: order.userId?.phone || info.customerPhone,
        lat: order.address?.location?.coordinates?.[1] || order.address?.location?.lat || info.customerLat,
        lng: order.address?.location?.coordinates?.[0] || order.address?.location?.lng || info.customerLng,
        image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=100&h=100&fit=crop&q=80"
      },
      restaurant: {
        name: order.restaurantId?.name || info.name || "Restaurant",
        address: order.restaurantId?.address || order.restaurantId?.location?.formattedAddress || info.address || "Restaurant address",
        phone: order.restaurantId?.phone || order.restaurantId?.ownerPhone || info.phone || info.ownerPhone || info.restaurantPhone,
        lat: order.restaurantId?.location?.coordinates?.[1] || order.restaurantId?.location?.lat || info.lat,
        lng: order.restaurantId?.location?.coordinates?.[0] || order.restaurantId?.location?.lng || info.lng,
        rating: order.restaurantId?.rating || 3.3
      },
      items: normalizedItems || [],
      cutlery:
        typeof order.sendCutlery === "boolean"
          ? (order.sendCutlery ? "Yes" : "No")
          : (order.cutlery || "No"),
      restaurantInstruction: order.note || "",
      deliveryInstruction: order.deliveryInstruction || "",
      paymentMethod: {
        status: paymentStatus,
        method: 
          order.paymentMethod === "cod" || 
          order.paymentMethod === "cash_on_delivery" ||
          order.payment?.method === "cod" ||
          order.payment?.method === "cash_on_delivery" ||
          info.paymentMethod === "cod" ||
          info.paymentMethod === "cash_on_delivery"
            ? "Cash"
            : order.paymentMethod || order.payment?.method || info.paymentMethod || "Cash"
      },
      billing: {
        subtotal: order.pricing?.subtotal || order.subtotal || (typeof info.total === "number" ? info.total : 0),
        deliveryFee: order.pricing?.deliveryFee || order.deliveryFee || 0,
        discount: order.pricing?.discount || order.discount || 0,
        deliverymanTips: order.pricing?.deliverymanTips || 0.0,
        total: order.pricing?.total || order.total || (typeof info.total === "number" ? info.total : 0)
      },
      statusMessage: statusMessage.message,
      statusDescription: statusMessage.description
    }
  }

  const displayOrderData = buildOrderData()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6e9dc] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#ff8100] animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center justify-between rounded-b-3xl md:rounded-b-none sticky top-0 z-10">
        <button 
          onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/delivery")}
          className="p-2 -ml-2"
        >
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-gray-900 font-medium">Order #{displayOrderData.id}</p>
          <p className="text-[#ff8100] text-sm font-medium">{displayOrderData.status}</p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Delivery Time Estimate */}
      <div className="px-4 py-4 bg-transparent">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-14 h-14 bg-red-100 rounded-lg flex items-center justify-center relative overflow-hidden">
              <Utensils className="w-7 h-7 text-red-600 z-10" />
              {/* Flames effect */}
              <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-orange-400 to-red-500 opacity-60"></div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Food need to deliver within</p>
            <p className="text-[#ff8100] font-bold text-lg">{displayOrderData.deliveryTime}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-4 space-y-6">
        {/* Customer Contact Details */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Customer Contact Details</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <img 
                src={displayOrderData.customer.image}
                alt="Customer"
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium mb-1">{displayOrderData.customer.name}</p>
                <p className="text-gray-600 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{displayOrderData.customer.address}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button 
                  onClick={() => {
                    const userId = orderData?.userId?._id || orderData?.userId || displayOrderData.customer.phone
                    navigate(`/delivery/profile/conversation/chat?orderId=${orderId}&type=customer&userId=${userId}`)
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#ff8100] flex items-center justify-center hover:bg-[#e67300] transition-colors flex-shrink-0"
                >
                  <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const customerPhone = normalizePhoneNumber(
                      displayOrderData.customer.phone ||
                      orderData?.userId?.phone ||
                      activeOrderInfo?.customerPhone ||
                      activeOrderInfo?.userId?.phone
                    )

                    if (!customerPhone) {
                      toast.error("Customer phone number not available")
                      return
                    }

                    window.location.href = `tel:${customerPhone}`
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors flex-shrink-0"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const opened = openNavigationMap({
                      lat: displayOrderData.customer.lat || orderData?.address?.location?.coordinates?.[1] || orderData?.address?.location?.lat,
                      lng: displayOrderData.customer.lng || orderData?.address?.location?.coordinates?.[0] || orderData?.address?.location?.lng,
                      address: displayOrderData.customer.address
                    })

                    if (!opened) {
                      toast.error("Customer location not available")
                    }
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors flex-shrink-0"
                >
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Restaurant Details */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Restaurant Details</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#ff8100] rounded-lg flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-medium mb-1">{displayOrderData.restaurant.name}</p>
                <p className="text-gray-600 text-sm mb-1 whitespace-nowrap overflow-hidden text-ellipsis">{displayOrderData.restaurant.address}</p>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-[#ff8100] rounded-full flex items-center justify-center">
                    <span className="text-white text-[8px]">★</span>
                  </div>
                  <span className="text-gray-600 text-sm">({displayOrderData.restaurant.rating})</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button 
                  onClick={() => {
                    const restaurantId = orderData?.restaurantId?._id || orderData?.restaurantId || displayOrderData.restaurant.phone
                    navigate(`/delivery/profile/conversation/chat?orderId=${orderId}&type=restaurant&restaurantId=${restaurantId}`)
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#ff8100] flex items-center justify-center hover:bg-[#e67300] transition-colors flex-shrink-0"
                >
                  <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const restaurantPhone = normalizePhoneNumber(
                      displayOrderData.restaurant.phone ||
                      orderData?.restaurantId?.phone ||
                      orderData?.restaurantId?.ownerPhone ||
                      activeOrderInfo?.phone ||
                      activeOrderInfo?.ownerPhone ||
                      activeOrderInfo?.restaurantPhone
                    )

                    if (!restaurantPhone) {
                      toast.error("Restaurant phone number not available")
                      return
                    }

                    window.location.href = `tel:${restaurantPhone}`
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors flex-shrink-0"
                >
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-white" />
                </button>
                <button 
                  onClick={() => {
                    const opened = openNavigationMap({
                      lat: displayOrderData.restaurant.lat || orderData?.restaurantId?.location?.coordinates?.[1] || orderData?.restaurantId?.location?.lat,
                      lng: displayOrderData.restaurant.lng || orderData?.restaurantId?.location?.coordinates?.[0] || orderData?.restaurantId?.location?.lng,
                      address: displayOrderData.restaurant.address
                    })

                    if (!opened) {
                      toast.error("Restaurant location not available")
                    }
                  }}
                  className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-300 flex items-center justify-center hover:bg-gray-400 transition-colors flex-shrink-0"
                >
                  <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Item Info */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Item Info ({displayOrderData.items.length})</h3>
          <div className="space-y-4">
            {displayOrderData.items.length > 0 ? (
              displayOrderData.items.map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <img 
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="text-gray-900 font-medium mb-1">{item.name}</p>
                      <p className="text-gray-900 font-semibold mb-1">₹ {item.price.toFixed(2)}</p>
                      <p className="text-gray-600 text-sm">Variations: {item.variation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-900 font-medium mb-2">Quantity: {item.quantity}</p>
                      <span className="inline-block bg-[#ff8100] text-white text-xs font-medium px-3 py-1 rounded">
                        {item.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-500">No items found</p>
              </div>
            )}
          </div>
        </div>

        {/* Cutlery */}
        <div className="flex items-center justify-between py-2">
          <span className="text-gray-900 font-medium">Cutlery:</span>
          <span className="text-gray-900 font-medium">{displayOrderData.cutlery}</span>
        </div>

        {displayOrderData.restaurantInstruction && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-gray-900 font-medium mb-1">Restaurant Instruction</p>
            <p className="text-gray-700 text-sm">{displayOrderData.restaurantInstruction}</p>
          </div>
        )}

        {displayOrderData.deliveryInstruction && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-900 font-medium mb-1">Delivery Instruction</p>
            <p className="text-amber-800 text-sm">{displayOrderData.deliveryInstruction}</p>
          </div>
        )}

        {/* Payment Method */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-900 font-medium">Payment Method</span>
            <span className="text-red-600 font-medium">{displayOrderData.paymentMethod.status}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <span className="text-gray-900 font-medium">{displayOrderData.paymentMethod.method}</span>
          </div>
        </div>

        {/* Billing Info */}
        <div>
          <h3 className="text-gray-900 font-semibold mb-3">Billing Info</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-900 font-medium">₹ {displayOrderData.billing.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Deliveryman Tips</span>
              <span className="text-gray-900 font-medium">(+) ₹ {displayOrderData.billing.deliverymanTips.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-gray-300">
              <span className="text-[#ff8100] font-semibold">Total Amount</span>
              <span className="text-[#ff8100] font-bold text-lg">₹ {displayOrderData.billing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Navigation Bar - Mobile Only */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex items-center justify-around py-2 px-4">
          <button 
            onClick={() => navigate("/delivery")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <Home className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Home</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/requests")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600 relative"
          >
            <div className="relative">
              <FileText className="w-6 h-6" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                5
              </span>
            </div>
            <span className="text-[10px] text-gray-600 font-medium">Request</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/orders")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <UtensilsCrossed className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Orders</span>
          </button>
          <button 
            onClick={() => navigate("/delivery/profile")}
            className="flex flex-col items-center gap-1 p-2 text-gray-600"
          >
            <User className="w-6 h-6" />
            <span className="text-[10px] text-gray-600 font-medium">Profile</span>
          </button>
        </div>
      </div>

      {/* Status Update Buttons - Above Status Bar */}
      {(() => {
        const normalizedStatus = normalizeDeliveryStatus(orderStatus)
        const isDelivered = normalizedStatus === DELIVERY_ORDER_STATUS.DELIVERED
        const isCancelled = normalizedStatus === DELIVERY_ORDER_STATUS.CANCELLED
        
        // Don't show buttons if order is delivered or cancelled
        if (isDelivered || isCancelled) return null
        
        return (
          <div className="fixed bottom-28 md:bottom-12 left-0 right-0 px-4 z-[60]">
            <div className="bg-white rounded-lg shadow-lg p-3 space-y-2">
              {normalizedStatus === DELIVERY_ORDER_STATUS.ACCEPTED && (
                <button
                  onClick={handleMarkPickedUp}
                  disabled={statusUpdating}
                  className="w-full bg-[#ff8100] hover:bg-[#e67300] disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {statusUpdating ? "Updating..." : "Mark as Picked Up"}
                </button>
              )}
              
              {normalizedStatus === DELIVERY_ORDER_STATUS.PICKED_UP && (
                <button
                  onClick={handleMarkOnTheWay}
                  disabled={statusUpdating}
                  className="w-full bg-[#ff8100] hover:bg-[#e67300] disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {statusUpdating ? "Updating..." : "Mark as On the Way"}
                </button>
              )}
              
              {normalizedStatus === DELIVERY_ORDER_STATUS.ON_THE_WAY && (
                <button
                  onClick={handleMarkDelivered}
                  disabled={statusUpdating}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {statusUpdating ? "Updating..." : "Mark as Delivered"}
                </button>
              )}
            </div>
          </div>
        )
      })()}

    </div>
  )
}


