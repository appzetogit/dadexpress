import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom"
import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  ArrowLeft,
  Share2,
  RefreshCw,
  Phone,
  ChevronRight,
  MapPin,
  Home as HomeIcon,
  MessageSquare,
  X,
  Check,
  Shield,
  Receipt,
  CircleSlash,
  Loader2,
  IndianRupee,
  Star
} from "lucide-react"
import AnimatedPage from "../../components/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { useOrders } from "../../context/OrdersContext"
import { useProfile } from "../../context/ProfileContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import DeliveryTrackingMap from "../../components/DeliveryTrackingMap"
import { orderAPI, restaurantAPI } from "@/lib/api"
import { API_ENDPOINTS } from "@/lib/api/endpoints"
import api from "@/lib/api/axios"
import circleIcon from "@/assets/circleicon.png"

// Animated checkmark component
const AnimatedCheckmark = ({ delay = 0 }) => (
  <motion.svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    initial="hidden"
    animate="visible"
    className="mx-auto"
  >
    <motion.circle
      cx="40"
      cy="40"
      r="36"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    />
    <motion.path
      d="M24 40 L35 51 L56 30"
      fill="none"
      stroke="#22c55e"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: delay + 0.4, ease: "easeOut" }}
    />
  </motion.svg>
)

const RESTAURANT_REJECTION_REASON_PATTERN =
  "rejected by restaurant|restaurant rejected|restaurant cancelled|restaurant is too busy|item not available|outside delivery area|kitchen closing|technical issue|order not accepted within time limit|restaurant did not respond"

const isRestaurantRejectedCancellation = (orderData) => {
  if (!orderData) return false

  const status = String(orderData.status || "").toLowerCase()
  if (status !== "cancelled" && status !== "canceled") return false

  const cancelledBy = String(orderData.cancelledBy || orderData.canceledBy || "").toLowerCase()
  const cancellationReason = String(
    orderData.cancellationReason || orderData.rejectReason || orderData.reason || ""
  ).toLowerCase()

  return (
    cancelledBy === "restaurant" ||
    new RegExp(RESTAURANT_REJECTION_REASON_PATTERN, "i").test(cancellationReason)
  )
}

// Real Delivery Map Component with User Live Location
const DeliveryMap = ({ orderId, order, isVisible }) => {
  const { location: userLocation } = useUserLocation() // Get user's live location

  // Get coordinates from order or use defaults (Indore)
  const getRestaurantCoords = () => {
    // Try multiple sources for restaurant coordinates
    let coords = null;

    // Priority 1: restaurantLocation.coordinates (already extracted in transformed order)
    if (order?.restaurantLocation?.coordinates &&
      Array.isArray(order.restaurantLocation.coordinates) &&
      order.restaurantLocation.coordinates.length >= 2) {
      coords = order.restaurantLocation.coordinates;
    }
    // Priority 2: restaurantId.location.coordinates (if restaurantId is populated)
    else if (order?.restaurantId?.location?.coordinates &&
      Array.isArray(order.restaurantId.location.coordinates) &&
      order.restaurantId.location.coordinates.length >= 2) {
      coords = order.restaurantId.location.coordinates;
    }
    // Priority 3: restaurantId.location with latitude/longitude
    else if (order?.restaurantId?.location?.latitude && order?.restaurantId?.location?.longitude) {
      coords = [order.restaurantId.location.longitude, order.restaurantId.location.latitude];
    }

    if (coords && coords.length >= 2) {
      // GeoJSON format is [longitude, latitude]
      const result = {
        lat: coords[1], // Latitude is second element
        lng: coords[0]  // Longitude is first element
      };
      return result;
    }

    // Default Indore coordinates
    return { lat: 22.7196, lng: 75.8577 };
  };

  const getCustomerCoords = () => {
    if (order?.address?.coordinates) {
      return {
        lat: order.address.coordinates[1],
        lng: order.address.coordinates[0]
      };
    }
    // Default Indore coordinates
    return { lat: 22.7196, lng: 75.8577 };
  };

  // Get user's live location coordinates
  const getUserLiveCoords = () => {
    if (userLocation?.latitude && userLocation?.longitude) {
      return {
        lat: userLocation.latitude,
        lng: userLocation.longitude
      };
    }
    return null;
  };

  const restaurantCoords = getRestaurantCoords();
  const customerCoords = getCustomerCoords();
  const userLiveCoords = getUserLiveCoords();

  // Delivery boy data
  const deliveryBoyData = order?.deliveryPartner ? {
    name: order.deliveryPartner.name || 'Delivery Partner',
    avatar: order.deliveryPartner.avatar || null
  } : null;

  if (!isVisible || !orderId || !order) {
    return (
      <motion.div
        className="relative h-64 bg-gradient-to-b from-gray-100 to-gray-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      />
    );
  }

  return (
    <motion.div
      className="relative h-64 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <DeliveryTrackingMap
        orderId={orderId}
        orderTrackingIds={[order?.mongoId, order?._id, order?.orderId, order?.id]}
        restaurantCoords={restaurantCoords}
        customerCoords={customerCoords}
        userLiveCoords={userLiveCoords}
        userLocationAccuracy={userLocation?.accuracy}
        deliveryBoyData={deliveryBoyData}
        order={order}
      />
    </motion.div>
  );
}

// Section item component
const SectionItem = ({ icon: Icon, title, subtitle, onClick, showArrow = true, rightContent }) => (
  <motion.button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left border-b border-dashed border-gray-200 last:border-0"
    whileTap={{ scale: 0.99 }}
  >
    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
      <Icon className="w-5 h-5 text-gray-600" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-gray-900 truncate">{title}</p>
      {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
    </div>
    {rightContent || (showArrow && <ChevronRight className="w-5 h-5 text-gray-400" />)}
  </motion.button>
)

export default function OrderTracking() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const confirmed = searchParams.get("confirmed") === "true"
  const { getOrderById } = useOrders()
  const { profile, getDefaultAddress } = useProfile()
  const { location: liveLocation, requestLocation, loading: locationLoading } = useUserLocation()

  // State for order data
  const [order, setOrder] = useState(null)
  const [restaurantDetails, setRestaurantDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showConfirmation, setShowConfirmation] = useState(confirmed)
  const [orderStatus, setOrderStatus] = useState('placed')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [cancellationReason, setCancellationReason] = useState("")
  const [isCancelling, setIsCancelling] = useState(false)
  const [timerNow, setTimerNow] = useState(Date.now())
  const [showLocationDialog, setShowLocationDialog] = useState(false)
  const [showDeliveryInstructionModal, setShowDeliveryInstructionModal] = useState(false)
  const [showTipDialog, setShowTipDialog] = useState(false)
  const [deliveryInstructionText, setDeliveryInstructionText] = useState("")
  const [tipAmount, setTipAmount] = useState("")
  const [isSavingInstruction, setIsSavingInstruction] = useState(false)
  const [isSavingTip, setIsSavingTip] = useState(false)
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false)
  const [ratingModal, setRatingModal] = useState({ open: false, order: null })
  const [selectedRating, setSelectedRating] = useState(null)
  const [feedbackText, setFeedbackText] = useState("")
  const [submittingRating, setSubmittingRating] = useState(false)
  const [locationForm, setLocationForm] = useState({
    formattedAddress: "",
    street: "",
    additionalDetails: "",
    city: "",
    state: "",
    zipCode: "",
    lat: "",
    lng: ""
  })

  const defaultAddress = getDefaultAddress()

  const deliveryPartnerName =
    order?.deliveryPartner?.name ||
    order?.deliveryPartnerName ||
    order?.deliveryPartnerId?.name ||
    ''

  const deliveryPartnerPhoneRaw =
    order?.deliveryPartner?.phone ||
    order?.deliveryPartner?.mobile ||
    order?.deliveryPartnerPhone ||
    order?.assignmentInfo?.deliveryPartnerPhone ||
    order?.assignmentInfo?.deliveryPartner?.phone ||
    order?.assignmentInfo?.deliveryPartner?.mobile ||
    order?.deliveryPartnerId?.phone ||
    order?.deliveryPartnerId?.mobile ||
    ''

  const deliveryPartnerPhone =
    typeof deliveryPartnerPhoneRaw === 'string' ? deliveryPartnerPhoneRaw.trim() : deliveryPartnerPhoneRaw || ''

  const restaurantPhoneRaw =
    restaurantDetails?.primaryContactNumber ||
    restaurantDetails?.phone ||
    restaurantDetails?.contactNumber ||
    restaurantDetails?.ownerPhone ||
    order?.restaurantId?.phone ||
    order?.restaurantId?.ownerPhone ||
    order?.restaurant?.phone ||
    order?.restaurant?.ownerPhone ||
    order?.restaurantInfo?.phone ||
    order?.restaurantInfo?.ownerPhone ||
    order?.restaurantDetails?.phone ||
    order?.restaurantDetails?.ownerPhone ||
    order?.restaurantPhone ||
    ''

  const restaurantPhone =
    typeof restaurantPhoneRaw === 'string' ? restaurantPhoneRaw.trim() : restaurantPhoneRaw || ''

  useEffect(() => {
    const fetchRestaurantDetails = async () => {
      const restaurantId = order?.restaurantId?._id || order?.restaurantId
      if (!restaurantId || typeof restaurantId !== 'string' || restaurantPhone) return

      try {
        const response = await restaurantAPI.getRestaurantById(restaurantId)
        if (response?.data?.success && response.data.data?.restaurant) {
          setRestaurantDetails(response.data.data.restaurant)
        } else if (response?.data?.restaurant) {
          setRestaurantDetails(response.data.restaurant)
        }
      } catch (err) {
        console.warn('Failed to fetch restaurant details:', err)
      }
    }

    fetchRestaurantDetails()
  }, [order?.restaurantId, restaurantPhone])

  const hasDeliveryPartner = Boolean(
    order?.deliveryPartnerId ||
    order?.assignmentInfo?.deliveryPartnerId ||
    deliveryPartnerName ||
    deliveryPartnerPhone
  )

  const handleCallDeliveryPartner = () => {
    if (!deliveryPartnerPhone) {
      toast.info('Delivery partner phone number is not available yet')
      return
    }
    const phone = String(deliveryPartnerPhone).replace(/\s+/g, '')
    window.location.href = `tel:${phone}`
  }

  const handleOpenDeliveryChat = () => {
    if (!hasDeliveryPartner) {
      toast.info('Delivery partner will be assigned soon')
      return
    }
    navigate(`/help/orders/${orderId}/chat`)
  }

  const handleCallRestaurant = () => {
    if (!restaurantPhone) return
    const phone = String(restaurantPhone).replace(/\s+/g, '')
    window.location.href = `tel:${phone}`
  }

  const isAdminAccepted = useMemo(() => {
    const status = order?.status
    return ['confirmed', 'preparing', 'ready'].includes(status)
  }, [order?.status])

  const acceptedAtMs = useMemo(() => {
    const timestamp =
      order?.tracking?.confirmed?.timestamp ||
      order?.tracking?.preparing?.timestamp ||
      order?.updatedAt ||
      order?.createdAt

    const parsed = timestamp ? new Date(timestamp).getTime() : NaN
    return Number.isFinite(parsed) ? parsed : null
  }, [order?.tracking?.confirmed?.timestamp, order?.tracking?.preparing?.timestamp, order?.updatedAt, order?.createdAt])

  const editWindowRemainingMs = useMemo(() => {
    if (!isAdminAccepted || !acceptedAtMs) return 0
    const remaining = 60000 - (timerNow - acceptedAtMs)
    return Math.max(0, remaining)
  }, [isAdminAccepted, acceptedAtMs, timerNow])

  const isEditWindowOpen = editWindowRemainingMs > 0

  const editWindowText = useMemo(() => {
    const totalSeconds = Math.ceil(editWindowRemainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }, [editWindowRemainingMs])

  const canUpdateLocationStatus = useMemo(() => {
    return ['pending', 'confirmed', 'preparing'].includes(order?.status)
  }, [order?.status])

  const isDeliveryPartnerAssigned = useMemo(() => {
    const deliveryStateStatus = order?.deliveryState?.status
    const deliveryPhase = order?.deliveryState?.currentPhase
    return Boolean(
      order?.deliveryPartnerId ||
      order?.assignmentInfo?.deliveryPartnerId ||
      ['accepted', 'en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'delivered'].includes(deliveryStateStatus) ||
      ['en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'completed'].includes(deliveryPhase)
    )
  }, [order?.deliveryPartnerId, order?.assignmentInfo?.deliveryPartnerId, order?.deliveryState?.status, order?.deliveryState?.currentPhase])

  const canUpdateLocation = canUpdateLocationStatus && !isDeliveryPartnerAssigned

  const locationUpdateBlockedReason = useMemo(() => {
    if (!order?.status) return "Order status unavailable"
    if (!canUpdateLocationStatus) return "Location updates allowed only while pending, confirmed, or preparing"
    if (isDeliveryPartnerAssigned) return "Delivery partner already assigned"
    return ""
  }, [order?.status, canUpdateLocationStatus, isDeliveryPartnerAssigned])

  const etaReferenceMs = useMemo(() => {
    const timestamp =
      order?.eta?.lastUpdated ||
      order?.updatedAt ||
      order?.tracking?.outForDelivery?.timestamp ||
      order?.tracking?.out_for_delivery?.timestamp ||
      order?.tracking?.ready?.timestamp ||
      order?.createdAt

    const parsed = timestamp ? new Date(timestamp).getTime() : NaN
    return Number.isFinite(parsed) ? parsed : null
  }, [
    order?.eta?.lastUpdated,
    order?.updatedAt,
    order?.tracking?.outForDelivery?.timestamp,
    order?.tracking?.out_for_delivery?.timestamp,
    order?.tracking?.ready?.timestamp,
    order?.createdAt
  ])

  const etaLabel = useMemo(() => {
    const minEta = Number(order?.eta?.min)
    const maxEta = Number(order?.eta?.max)
    const estimated = Number(order?.estimatedDeliveryTime)
    const routeToDeliveryDuration = Number(order?.deliveryState?.routeToDelivery?.duration)
    const routeToPickupDuration = Number(order?.deliveryState?.routeToPickup?.duration)
    const fallbackEstimated = Number.isFinite(estimated) && estimated > 0
      ? estimated
      : (Number.isFinite(routeToDeliveryDuration) && routeToDeliveryDuration > 0
        ? routeToDeliveryDuration
        : (Number.isFinite(routeToPickupDuration) && routeToPickupDuration > 0 ? routeToPickupDuration : NaN))
    const elapsedMinutes = etaReferenceMs
      ? Math.max(0, Math.floor((timerNow - etaReferenceMs) / 60000))
      : 0

    if (Number.isFinite(minEta) || Number.isFinite(maxEta)) {
      const baseMin = Number.isFinite(minEta) ? minEta : maxEta
      const baseMax = Number.isFinite(maxEta) ? maxEta : minEta
      const liveMin = Math.max(1, Math.ceil(baseMin - elapsedMinutes))
      const liveMax = Math.max(liveMin, Math.ceil(baseMax - elapsedMinutes))
      return liveMin === liveMax ? `${liveMin} mins` : `${liveMin}-${liveMax} mins`
    }

    if (Number.isFinite(fallbackEstimated)) {
      const liveEstimated = Math.max(1, Math.ceil(fallbackEstimated - elapsedMinutes))
      return `${liveEstimated} mins`
    }

    return ""
  }, [
    order?.eta?.min,
    order?.eta?.max,
    order?.estimatedDeliveryTime,
    order?.deliveryState?.routeToDelivery?.duration,
    order?.deliveryState?.routeToPickup?.duration,
    etaReferenceMs,
    timerNow
  ])

  useEffect(() => {
    if (!order || showLocationDialog) return
    const coords = order?.address?.location?.coordinates || []
    setLocationForm({
      formattedAddress: order?.address?.formattedAddress || "",
      street: order?.address?.street || "",
      additionalDetails: order?.address?.additionalDetails || "",
      city: order?.address?.city || "",
      state: order?.address?.state || "",
      zipCode: order?.address?.zipCode || "",
      lat: coords[1] ?? "",
      lng: coords[0] ?? ""
    })
  }, [order, showLocationDialog])

  useEffect(() => {
    const hasLiveEta = Boolean(
      Number.isFinite(Number(order?.eta?.min)) ||
      Number.isFinite(Number(order?.eta?.max)) ||
      Number.isFinite(Number(order?.estimatedDeliveryTime))
    )

    if (!isEditWindowOpen && !hasLiveEta) return
    const interval = setInterval(() => {
      setTimerNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [isEditWindowOpen, order?.eta?.min, order?.eta?.max, order?.estimatedDeliveryTime])

  // Poll for order updates (especially when delivery partner accepts)
  // Only poll if delivery partner is not yet assigned to avoid unnecessary updates
  useEffect(() => {
    if (!orderId || !order) return;

    // Skip polling if delivery partner is already assigned and accepted
    const currentDeliveryStatus = order?.deliveryState?.status;
    const currentPhase = order?.deliveryState?.currentPhase;
    const hasDeliveryPartner = currentDeliveryStatus === 'accepted' ||
      currentPhase === 'en_route_to_pickup' ||
      currentPhase === 'at_pickup' ||
      currentPhase === 'en_route_to_delivery';

    // If delivery partner is assigned, reduce polling frequency to 30 seconds
    // If not assigned, poll every 5 seconds to detect assignment
    const pollInterval = hasDeliveryPartner ? 30000 : 5000;

    const interval = setInterval(async () => {
      try {
        const response = await orderAPI.getOrderDetails(orderId);
        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order;

          // Check if delivery state changed (e.g., status became 'accepted')
          const newDeliveryStatus = apiOrder.deliveryState?.status;
          const newPhase = apiOrder.deliveryState?.currentPhase;
          const newOrderStatus = apiOrder.status;
          const currentOrderStatus = order?.status;
          const newEtaMin = Number(apiOrder.eta?.min);
          const newEtaMax = Number(apiOrder.eta?.max);
          const currentEtaMin = Number(order?.eta?.min);
          const currentEtaMax = Number(order?.eta?.max);
          const newEstimatedTime = Number(apiOrder.estimatedDeliveryTime);
          const currentEstimatedTime = Number(order?.estimatedDeliveryTime);
          const etaChanged = (Number.isFinite(newEtaMin) && newEtaMin !== currentEtaMin) ||
            (Number.isFinite(newEtaMax) && newEtaMax !== currentEtaMax) ||
            (Number.isFinite(newEstimatedTime) && newEstimatedTime !== currentEstimatedTime);

          // Check if order was cancelled
          if (newOrderStatus === 'cancelled' && currentOrderStatus !== 'cancelled') {
            if (isRestaurantRejectedCancellation(apiOrder)) {
              setOrderStatus('placed');
            } else {
              setOrderStatus('cancelled');
            }
          }

          // Only update if status actually changed
          if (newDeliveryStatus === 'accepted' ||
            (newDeliveryStatus !== currentDeliveryStatus) ||
            (newPhase !== currentPhase) ||
            (newOrderStatus !== currentOrderStatus) ||
            etaChanged) {
            // Re-fetch and update order (same logic as initial fetch)
            let restaurantCoords = null;
            if (apiOrder.restaurantId?.location?.coordinates &&
              Array.isArray(apiOrder.restaurantId.location.coordinates) &&
              apiOrder.restaurantId.location.coordinates.length >= 2) {
              restaurantCoords = apiOrder.restaurantId.location.coordinates;
            } else if (typeof apiOrder.restaurantId === 'string') {
              try {
                const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
                if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                  const restaurant = restaurantResponse.data.data.restaurant;
                  if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                    restaurantCoords = restaurant.location.coordinates;
                  }
                }
              } catch (err) {
                console.error('Error fetching restaurant details:', err);
              }
            }

            const transformedOrder = {
              ...apiOrder,
              mongoId: apiOrder?._id || null,
              orderId: apiOrder?.orderId || apiOrder?._id || null,
              id: apiOrder?.orderId || apiOrder?._id || null,
              restaurantPhone: apiOrder?.restaurantId?.phone || apiOrder?.restaurantId?.ownerPhone || apiOrder?.restaurantPhone || '',
              restaurantLocation: restaurantCoords ? {
                coordinates: restaurantCoords
              } : order.restaurantLocation,
              deliveryPartner: apiOrder.deliveryPartnerId ? {
                name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
                phone: apiOrder.deliveryPartnerId.phone || '',
                avatar: null
              } : null,
              deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
              assignmentInfo: apiOrder.assignmentInfo || null,
              deliveryState: apiOrder.deliveryState || null,
              createdAt: apiOrder.createdAt || null,
              updatedAt: apiOrder.updatedAt || null,
              totalAmount: apiOrder.pricing?.total || apiOrder.totalAmount || 0,
              deliveryFee: apiOrder.pricing?.deliveryFee || apiOrder.deliveryFee || 0,
              gst: apiOrder.pricing?.gst || apiOrder.gst || 0,
              paymentMethod: apiOrder.paymentMethod || null,
              eta: apiOrder.eta || null,
              estimatedDeliveryTime: apiOrder.estimatedDeliveryTime ?? null,
              customerTip: Number(apiOrder.customerTip || 0)
            };

            setOrder(transformedOrder);
          }
        }
      } catch (err) {
        console.error('Error polling order updates:', err);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [orderId, order?.deliveryState?.status, order?.deliveryState?.currentPhase]);

  // Fetch order from API if not found in context
  useEffect(() => {
    const fetchOrder = async () => {
      // First try to get from context (localStorage)
      const contextOrder = getOrderById(orderId)
      const hasContextOrder = Boolean(contextOrder)
      if (contextOrder) {
        contextOrder.mongoId = contextOrder.mongoId ||
          contextOrder._id ||
          (typeof contextOrder.id === 'string' && /^[a-f0-9]{24}$/i.test(contextOrder.id) ? contextOrder.id : null);
        contextOrder.orderId = contextOrder.orderId ||
          (typeof contextOrder.id === 'string' && contextOrder.id.startsWith('ORD-') ? contextOrder.id : null);
        // Ensure restaurant location is available in context order
        if (!contextOrder.restaurantLocation?.coordinates && contextOrder.restaurantId?.location?.coordinates) {
          contextOrder.restaurantLocation = {
            coordinates: contextOrder.restaurantId.location.coordinates
          };
        }
        // Also ensure restaurantId is present
        if (!contextOrder.restaurantId && contextOrder.restaurant) {
          // Try to preserve restaurantId if it exists
        }
        setOrder(contextOrder)
        setLoading(false)
      }

      // If not in context, fetch from API
      try {
        if (!orderId) return;
        if (!hasContextOrder) {
          setLoading(true)
        }
        setError(null)

        const response = await orderAPI.getOrderDetails(orderId)

        if (response.data?.success && response.data.data?.order) {
          const apiOrder = response.data.data.order

          // Log full API response structure for debugging
          // Extract restaurant location coordinates with multiple fallbacks
          let restaurantCoords = null;

          // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
          if (apiOrder.restaurantId?.location?.coordinates &&
            Array.isArray(apiOrder.restaurantId.location.coordinates) &&
            apiOrder.restaurantId.location.coordinates.length >= 2) {
            restaurantCoords = apiOrder.restaurantId.location.coordinates;
          }
          // Priority 2: restaurantId.location with latitude/longitude properties
          else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
            restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
          }
          // Priority 3: Check if restaurantId is a string ID and fetch restaurant details
          else if (typeof apiOrder.restaurantId === 'string') {
            try {
              const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
              if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
                const restaurant = restaurantResponse.data.data.restaurant;
                if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                  restaurantCoords = restaurant.location.coordinates;
                }
              }
            } catch (err) {
              console.error('Error fetching restaurant details:', err);
            }
          }
          // Priority 4: Check nested restaurant data
          else if (apiOrder.restaurant?.location?.coordinates) {
            restaurantCoords = apiOrder.restaurant.location.coordinates;
          }


          // Transform API order to match component structure
          const transformedOrder = {
            id: apiOrder.orderId || apiOrder._id,
            mongoId: apiOrder._id || null,
            orderId: apiOrder.orderId || apiOrder._id,
            restaurant: apiOrder.restaurantName || 'Restaurant',
            restaurantId: apiOrder.restaurantId || null, // Include restaurantId for location access
            restaurantPhone: apiOrder?.restaurantId?.phone || apiOrder?.restaurantId?.ownerPhone || apiOrder?.restaurantPhone || '',
            userId: apiOrder.userId || null, // Include user data for phone number
            userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',
            userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',
            address: {
              street: apiOrder.address?.street || '',
              city: apiOrder.address?.city || '',
              state: apiOrder.address?.state || '',
              zipCode: apiOrder.address?.zipCode || '',
              additionalDetails: apiOrder.address?.additionalDetails || '',
              formattedAddress: apiOrder.address?.formattedAddress ||
                (apiOrder.address?.street && apiOrder.address?.city
                  ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`
                  : apiOrder.address?.city || ''),
              coordinates: apiOrder.address?.location?.coordinates || null
            },
            restaurantLocation: {
              coordinates: restaurantCoords
            },
            items: apiOrder.items?.map(item => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price
            })) || [],
            total: apiOrder.pricing?.total || 0,
            status: apiOrder.status || 'pending',
            cancellationReason: apiOrder.cancellationReason || '',
            cancelledBy: apiOrder.cancelledBy || '',
            deliveryPartner: apiOrder.deliveryPartnerId ? {
              name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
              phone: apiOrder.deliveryPartnerId.phone || '',
              avatar: null
            } : null,
            deliveryPartnerId: apiOrder.deliveryPartnerId?._id || apiOrder.deliveryPartnerId || apiOrder.assignmentInfo?.deliveryPartnerId || null,
            assignmentInfo: apiOrder.assignmentInfo || null,
            tracking: apiOrder.tracking || {},
            deliveryState: apiOrder.deliveryState || null,
            createdAt: apiOrder.createdAt || null,
            updatedAt: apiOrder.updatedAt || null,
            totalAmount: apiOrder.pricing?.total || apiOrder.totalAmount || 0,
            deliveryFee: apiOrder.pricing?.deliveryFee || apiOrder.deliveryFee || 0,
            gst: apiOrder.pricing?.gst || apiOrder.pricing?.tax || apiOrder.gst || apiOrder.tax || 0,
            platformFee: apiOrder.pricing?.platformFee || apiOrder.platformFee || 0,
            paymentMethod: apiOrder.paymentMethod || null,
            eta: apiOrder.eta || null,
            estimatedDeliveryTime: apiOrder.estimatedDeliveryTime ?? null,
            deliveryInstruction: apiOrder.deliveryInstruction || '',
            customerTip: Number(apiOrder.customerTip || 0)
          }

          setOrder(transformedOrder)

          // Update orderStatus based on API order status
          if (apiOrder.status === 'cancelled') {
            if (isRestaurantRejectedCancellation(apiOrder)) {
              setOrderStatus('placed');
            } else {
              setOrderStatus('cancelled');
            }
          } else if (apiOrder.status === 'preparing') {
            setOrderStatus('preparing');
          } else if (apiOrder.status === 'ready') {
            setOrderStatus('pickup');
          } else if (apiOrder.status === 'out_for_delivery') {
            setOrderStatus('pickup');
          } else if (apiOrder.status === 'delivered') {
            setOrderStatus('delivered');
          }
        } else {
          throw new Error('Order not found')
        }
      } catch (err) {
        console.error('Error fetching order:', err)
        setError(err.response?.data?.message || err.message || 'Failed to fetch order')
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      fetchOrder()
    }
  }, [orderId, getOrderById])

  // Simulate order status progression
  useEffect(() => {
    if (confirmed) {
      const timer1 = setTimeout(() => {
        setShowConfirmation(false)
        setOrderStatus('preparing')
      }, 3000)
      return () => clearTimeout(timer1)
    }
  }, [confirmed])

  useEffect(() => {
    if (!order) return

    const normalizedStatus = String(order.status || '').toLowerCase()
    const deliveryStateStatus = String(order?.deliveryState?.status || '').toLowerCase()
    const deliveryPhase = String(order?.deliveryState?.currentPhase || '').toLowerCase()
    const isOutForDelivery = Boolean(
      order?.tracking?.outForDelivery?.status ||
      order?.tracking?.out_for_delivery?.status ||
      normalizedStatus === 'out_for_delivery' ||
      deliveryStateStatus === 'en_route_to_delivery' ||
      deliveryPhase === 'en_route_to_delivery' ||
      deliveryPhase === 'at_delivery'
    )
    const isDelivered = Boolean(
      normalizedStatus === 'delivered' ||
      deliveryStateStatus === 'delivered' ||
      deliveryPhase === 'completed'
    )
    const isCancelled = normalizedStatus === 'cancelled'

    let nextStatus = 'placed'

    if (isCancelled) {
      nextStatus = 'cancelled'
    } else if (isDelivered) {
      nextStatus = 'delivered'
    } else if (isOutForDelivery || normalizedStatus === 'ready') {
      nextStatus = 'pickup'
    } else if (normalizedStatus === 'preparing') {
      nextStatus = 'preparing'
    }

    setOrderStatus((prev) => (prev === nextStatus ? prev : nextStatus))
  }, [
    order?.status,
    order?.tracking?.outForDelivery?.status,
    order?.tracking?.out_for_delivery?.status,
    order?.deliveryState?.status,
    order?.deliveryState?.currentPhase
  ])

  // Sync ETA updates emitted from the tracking socket
  useEffect(() => {
    const handleEtaUpdated = (event) => {
      const data = event?.detail
      if (!data) return
      const idMatches = [data.orderId, data.orderMongoId]
        .filter(Boolean)
        .some((id) => {
          const idStr = String(id)
          return [
            orderId,
            order?.orderId,
            order?.mongoId,
            order?._id,
            order?.id
          ].filter(Boolean).some((candidate) => String(candidate) === idStr)
        })

      if (!idMatches) return

      const minEta = Number(data?.eta?.min)
      const maxEta = Number(data?.eta?.max)
      const hasEta = Number.isFinite(minEta) && Number.isFinite(maxEta)

      setOrder((prev) => {
        if (!prev) return prev
        const nextEta = {
          ...prev.eta,
          ...(hasEta ? { min: minEta, max: maxEta } : {}),
          lastUpdated: data?.eta?.lastUpdated || data?.timestamp || prev?.eta?.lastUpdated
        }
        return {
          ...prev,
          eta: nextEta,
          estimatedDeliveryTime: hasEta ? Math.round((minEta + maxEta) / 2) : prev.estimatedDeliveryTime
        }
      })
    }

    window.addEventListener('etaUpdated', handleEtaUpdated)
    return () => {
      window.removeEventListener('etaUpdated', handleEtaUpdated)
    }
  }, [orderId, order?.orderId, order?.mongoId, order?._id, order?.id])

  // Listen for order status updates from socket (e.g., "Delivery partner on the way")
  useEffect(() => {
    const handleOrderStatusNotification = (event) => {
      const { message, title, status, estimatedDeliveryTime } = event.detail;


      // Update order status in UI
      if (status === 'out_for_delivery') {
        setOrderStatus('pickup');
      } else if (status === 'delivered' || status === 'completed') {
        setOrderStatus('delivered');
      } else if (status === 'cancelled') {
        setOrderStatus('cancelled');
      }

      // Keep order object in sync so all dependent UI uses latest status immediately.
      if (status) {
        setOrder((prev) => (prev ? { ...prev, status } : prev));
      }

      // Show notification toast
      if (message) {
        toast.success(message, {
          duration: 5000,
          icon: '🚚',
          position: 'top-center',
          description: estimatedDeliveryTime
            ? `Estimated delivery in ${Math.round(estimatedDeliveryTime / 60)} minutes`
            : undefined
        });

        // Optional: Vibrate device if supported
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
      }
    };

    // Listen for custom event from DeliveryTrackingMap
    window.addEventListener('orderStatusNotification', handleOrderStatusNotification);

    return () => {
      window.removeEventListener('orderStatusNotification', handleOrderStatusNotification);
    };
  }, [])

  const handleCancelOrder = () => {
    // Check if order can be cancelled (only Razorpay orders that aren't delivered/cancelled)
    if (!order) return;

    if (order.status === 'cancelled') {
      toast.error('Order is already cancelled');
      return;
    }

    if (order.status === 'delivered') {
      toast.error('Cannot cancel a delivered order');
      return;
    }

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    setShowCancelDialog(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }

    setIsCancelling(true);
    try {
      const response = await orderAPI.cancelOrder(orderId, cancellationReason.trim());
      if (response.data?.success) {
        const paymentMethod = order?.payment?.method || order?.paymentMethod;
        const successMessage = response.data?.message ||
          (paymentMethod === 'cash' || paymentMethod === 'cod'
            ? 'Order cancelled successfully. No refund required as payment was not made.'
            : 'Order cancelled successfully. Refund will be processed after admin approval.');
        toast.success(successMessage);
        setShowCancelDialog(false);
        setCancellationReason("");
        // Refresh order data
        const orderResponse = await orderAPI.getOrderDetails(orderId);
        if (orderResponse.data?.success && orderResponse.data.data?.order) {
          const apiOrder = orderResponse.data.data.order;
          setOrder(apiOrder);
          // Update orderStatus to cancelled
          if (apiOrder.status === 'cancelled') {
            setOrderStatus('cancelled');
          }
        }
      } else {
        toast.error(response.data?.message || 'Failed to cancel order');
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast.error(error.response?.data?.message || 'Failed to cancel order');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href
    const shareTitle = `Track my order from ${order?.restaurant || 'Quick Spicy'}`
    const shareText = `Hey! Track my order from ${order?.restaurant || 'Quick Spicy'} with ID #${order?.orderId || order?.id}.`

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } else {
        const encoded = encodeURIComponent(`${shareText} ${shareUrl}`)
        const shareWindow = window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer')
        if (!shareWindow) {
          window.location.href = `https://wa.me/?text=${encoded}`
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
        toast.error("Failed to share link");
      }
    }
  };

  useEffect(() => {
    if (!showDeliveryInstructionModal) return
    setDeliveryInstructionText(order?.deliveryInstruction || "")
  }, [showDeliveryInstructionModal, order?.deliveryInstruction])

  useEffect(() => {
    if (!showTipDialog) return
    const currentTip = Number(order?.customerTip || 0)
    setTipAmount(currentTip > 0 ? String(currentTip) : "")
  }, [showTipDialog, order?.customerTip])

  const handleSaveDeliveryInstruction = async () => {
    if (!order?.id && !order?.orderId && !orderId) {
      toast.error('Order not found')
      return
    }

    try {
      setIsSavingInstruction(true)
      const currentOrderId = order?.id || order?.orderId || orderId
      const response = await orderAPI.updateDeliveryInstruction(currentOrderId, deliveryInstructionText.trim())

      if (response?.data?.success) {
        setOrder((prev) => (prev ? { ...prev, deliveryInstruction: deliveryInstructionText.trim() } : prev))
        toast.success('Delivery instruction updated')
        setShowDeliveryInstructionModal(false)
      } else {
        toast.error(response?.data?.message || 'Failed to update delivery instruction')
      }
    } catch (error) {
      console.error('Error updating delivery instruction:', error)
      toast.error(error?.response?.data?.message || 'Failed to update delivery instruction')
    } finally {
      setIsSavingInstruction(false)
    }
  }

  const handleSaveCustomerTip = async () => {
    if (!order?.id && !order?.orderId && !orderId) {
      toast.error('Order not found')
      return
    }

    const parsedTip = Number(tipAmount)
    if (!Number.isFinite(parsedTip) || parsedTip < 0) {
      toast.error('Please enter a valid tip amount')
      return
    }

    try {
      setIsSavingTip(true)
      const currentOrderId = order?.id || order?.orderId || orderId
      const response = await orderAPI.updateCustomerTip(currentOrderId, parsedTip)

      if (response?.data?.success) {
        setOrder((prev) => (prev ? { ...prev, customerTip: Number(parsedTip.toFixed(2)) } : prev))
        toast.success('Tip updated')
        setShowTipDialog(false)
      } else {
        toast.error(response?.data?.message || 'Failed to update tip')
      }
    } catch (error) {
      console.error('Error updating tip:', error)
      toast.error(error?.response?.data?.message || 'Failed to update tip')
    } finally {
      setIsSavingTip(false)
    }
  }

  const handleUseCurrentLocation = async () => {
    try {
      const freshLocation = (liveLocation?.latitude && liveLocation?.longitude)
        ? liveLocation
        : await requestLocation();

      if (!freshLocation?.latitude || !freshLocation?.longitude) {
        toast.error('Unable to get current location');
        return;
      }

      setLocationForm((prev) => ({
        ...prev,
        lat: freshLocation.latitude,
        lng: freshLocation.longitude,
        formattedAddress: prev.formattedAddress || freshLocation.formattedAddress || freshLocation.address || ""
      }))
    } catch (error) {
      console.error('Failed to get current location:', error);
      toast.error('Failed to get current location');
    }
  };

  const handleUpdateLocation = async () => {
    if (!canUpdateLocation) {
      toast.error(locationUpdateBlockedReason || 'Location update not allowed');
      return;
    }

    const latNum = Number(locationForm.lat);
    const lngNum = Number(locationForm.lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      toast.error('Please provide valid latitude and longitude');
      return;
    }

    setIsUpdatingLocation(true);
    try {
      const payload = {
        formattedAddress: locationForm.formattedAddress?.trim() || "",
        street: locationForm.street?.trim() || "",
        additionalDetails: locationForm.additionalDetails?.trim() || "",
        city: locationForm.city?.trim() || "",
        state: locationForm.state?.trim() || "",
        zipCode: locationForm.zipCode?.trim() || "",
        location: {
          type: "Point",
          coordinates: [lngNum, latNum]
        }
      };

      const response = await orderAPI.updateDeliveryLocation(orderId, payload);
      if (response.data?.success) {
        const updatedAddress = response.data?.data?.address || payload;
        const normalizedAddress = {
          ...updatedAddress,
          coordinates: updatedAddress?.coordinates || updatedAddress?.location?.coordinates || payload.location.coordinates
        };
        setOrder((prev) => prev ? { ...prev, address: normalizedAddress } : prev);
        toast.success('Delivery location updated');
        setShowLocationDialog(false);
      } else {
        toast.error(response.data?.message || 'Failed to update delivery location');
      }
    } catch (error) {
      console.error('Error updating delivery location:', error);
      toast.error(error.response?.data?.message || 'Failed to update delivery location');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleOpenRating = (orderData) => {
    setRatingModal({ open: true, order: orderData })
    setSelectedRating(orderData?.rating || null)
    setFeedbackText(orderData?.review?.comment || "")
  }

  const handleCloseRating = () => {
    setRatingModal({ open: false, order: null })
    setSelectedRating(null)
    setFeedbackText("")
  }

  const handleSubmitRating = async () => {
    if (!ratingModal.order || selectedRating === null) {
      toast.error("Please select a rating first")
      return
    }

    try {
      setSubmittingRating(true)

      const orderData = ratingModal.order

      await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: selectedRating,
        module: "user",
        restaurantId: orderData.restaurantId || null,
        metadata: {
          orderId: orderData.id,
          orderMongoId: orderData.mongoId,
          orderTotal: orderData.totalAmount || orderData.total,
          restaurantName: orderData.restaurant,
          comment: feedbackText || undefined,
        },
      })

      // Update local state so UI shows "You rated"
      setOrder(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          rating: selectedRating,
          review: { rating: selectedRating, comment: feedbackText || undefined }
        }
      })

      toast.success("Thanks for rating your order! 🎉")
      handleCloseRating()
    } catch (error) {
      console.error("Error submitting order rating:", error)
      toast.error(
        error?.response?.data?.message ||
        "Failed to submit rating. Please try again."
      )
    } finally {
      setSubmittingRating(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await orderAPI.getOrderDetails(orderId)
      if (response.data?.success && response.data.data?.order) {
        const apiOrder = response.data.data.order

        // Extract restaurant location coordinates with multiple fallbacks
        let restaurantCoords = null;

        // Priority 1: restaurantId.location.coordinates (GeoJSON format: [lng, lat])
        if (apiOrder.restaurantId?.location?.coordinates &&
          Array.isArray(apiOrder.restaurantId.location.coordinates) &&
          apiOrder.restaurantId.location.coordinates.length >= 2) {
          restaurantCoords = apiOrder.restaurantId.location.coordinates;
        }
        // Priority 2: restaurantId.location with latitude/longitude properties
        else if (apiOrder.restaurantId?.location?.latitude && apiOrder.restaurantId?.location?.longitude) {
          restaurantCoords = [apiOrder.restaurantId.location.longitude, apiOrder.restaurantId.location.latitude];
        }
        // Priority 3: Check nested restaurant data
        else if (apiOrder.restaurant?.location?.coordinates) {
          restaurantCoords = apiOrder.restaurant.location.coordinates;
        }
        // Priority 4: Check if restaurantId is a string ID and fetch restaurant details
        else if (typeof apiOrder.restaurantId === 'string') {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(apiOrder.restaurantId);
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              const restaurant = restaurantResponse.data.data.restaurant;
              if (restaurant.location?.coordinates && Array.isArray(restaurant.location.coordinates) && restaurant.location.coordinates.length >= 2) {
                restaurantCoords = restaurant.location.coordinates;
              }
            }
          } catch (err) {
            console.error('Error fetching restaurant details:', err);
          }
        }

        const transformedOrder = {
          id: apiOrder.orderId || apiOrder._id,
          mongoId: apiOrder._id || null,
          orderId: apiOrder.orderId || apiOrder._id,
          restaurant: apiOrder.restaurantName || 'Restaurant',
          restaurantId: apiOrder.restaurantId || null, // Include restaurantId for location access
          restaurantPhone: apiOrder?.restaurantId?.phone || apiOrder?.restaurantId?.ownerPhone || apiOrder?.restaurantPhone || '',
          userId: apiOrder.userId || null, // Include user data for phone number
          userName: apiOrder.userName || apiOrder.userId?.name || apiOrder.userId?.fullName || '',
          userPhone: apiOrder.userPhone || apiOrder.userId?.phone || '',
          address: {
            street: apiOrder.address?.street || '',
            city: apiOrder.address?.city || '',
            state: apiOrder.address?.state || '',
            zipCode: apiOrder.address?.zipCode || '',
            additionalDetails: apiOrder.address?.additionalDetails || '',
            formattedAddress: apiOrder.address?.formattedAddress ||
              (apiOrder.address?.street && apiOrder.address?.city
                ? `${apiOrder.address.street}${apiOrder.address.additionalDetails ? `, ${apiOrder.address.additionalDetails}` : ''}, ${apiOrder.address.city}${apiOrder.address.state ? `, ${apiOrder.address.state}` : ''}${apiOrder.address.zipCode ? ` ${apiOrder.address.zipCode}` : ''}`
                : apiOrder.address?.city || ''),
            coordinates: apiOrder.address?.location?.coordinates || null
          },
          restaurantLocation: {
            coordinates: restaurantCoords
          },
          items: apiOrder.items?.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price
          })) || [],
          total: apiOrder.pricing?.total || 0,
          status: apiOrder.status || 'pending',
          cancellationReason: apiOrder.cancellationReason || '',
          cancelledBy: apiOrder.cancelledBy || '',
          deliveryPartner: apiOrder.deliveryPartnerId ? {
            name: apiOrder.deliveryPartnerId.name || 'Delivery Partner',
            phone: apiOrder.deliveryPartnerId.phone || '',
            avatar: null
          } : null,
          tracking: apiOrder.tracking || {},
          deliveryState: apiOrder.deliveryState || null,
          createdAt: apiOrder.createdAt || null,
          updatedAt: apiOrder.updatedAt || null,
          totalAmount: apiOrder.pricing?.total || apiOrder.totalAmount || 0,
          deliveryFee: apiOrder.pricing?.deliveryFee || apiOrder.deliveryFee || 0,
          gst: apiOrder.pricing?.gst || apiOrder.pricing?.tax || apiOrder.gst || apiOrder.tax || 0,
          platformFee: apiOrder.pricing?.platformFee || apiOrder.platformFee || 0,
          eta: apiOrder.eta || null,
          estimatedDeliveryTime: apiOrder.estimatedDeliveryTime ?? null,
          deliveryInstruction: apiOrder.deliveryInstruction || '',
          customerTip: Number(apiOrder.customerTip || 0)
        }
        setOrder(transformedOrder)

        // Update order status for UI
        if (apiOrder.status === 'cancelled') {
          if (isRestaurantRejectedCancellation(apiOrder)) {
            setOrderStatus('placed');
          } else {
            setOrderStatus('cancelled');
          }
        } else if (apiOrder.status === 'preparing') {
          setOrderStatus('preparing')
        } else if (apiOrder.status === 'ready') {
          setOrderStatus('pickup')
        } else if (apiOrder.status === 'out_for_delivery') {
          setOrderStatus('pickup')
        } else if (apiOrder.status === 'delivered') {
          setOrderStatus('delivered')
        }
      }
    } catch (err) {
      console.error('Error refreshing order:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </AnimatedPage>
    )
  }

  // Error state
  if (error || !order) {
    return (
      <AnimatedPage className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The order you\'re looking for doesn\'t exist.'}</p>
          <Link to="/user/orders">
            <Button>Back to Orders</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  const etaSubtitle = etaLabel ? `Arriving in ${etaLabel}` : "Arriving soon"

  const statusConfig = {
    placed: {
      title: "Order placed",
      subtitle: "Food preparation will begin shortly",
      color: "bg-[#EB590E]"
    },
    preparing: {
      title: "Preparing your order",
      subtitle: etaSubtitle,
      color: "bg-[#EB590E]"
    },
    pickup: {
      title: "Order picked up",
      subtitle: etaSubtitle,
      color: "bg-[#EB590E]"
    },
    delivered: {
      title: "Order delivered",
      subtitle: "Enjoy your meal!",
      color: "bg-[#EB590E]"
    },
    cancelled: {
      title: "Order cancelled",
      subtitle: "This order has been cancelled",
      color: "bg-red-600"
    }
  }

  const currentStatus = statusConfig[orderStatus] || statusConfig.placed

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0a]">
      {/* Order Confirmed Modal */}
      <AnimatePresence>
        {showConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white dark:bg-[#1a1a1a] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="text-center px-8"
            >
              <AnimatedCheckmark delay={0.3} />
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
                className="text-2xl font-bold text-gray-900 mt-6"
              >
                Order Confirmed!
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
                className="text-gray-600 mt-2"
              >
                Your order has been placed successfully
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="mt-8"
              >
                <div className="w-8 h-8 border-2 border-[#EB590E] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500 mt-3">Loading order details...</p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Green Header */}
      <motion.div
        className={`${currentStatus.color} text-white sticky top-0 z-40`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Navigation bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/user/orders">
            <motion.button
              className="w-10 h-10 flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
            >
              <ArrowLeft className="w-6 h-6" />
            </motion.button>
          </Link>
          <h2 className="font-semibold text-lg">{order.restaurant}</h2>
          <motion.button
            className="w-10 h-10 flex items-center justify-center cursor-pointer"
            whileTap={{ scale: 0.9 }}
            onClick={handleShare}
          >
            <Share2 className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Status section */}
        <div className="px-4 pb-4 text-center">
          <motion.h1
            className="text-2xl font-bold mb-3"
            key={currentStatus.title}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {currentStatus.title}
          </motion.h1>

          {/* Status pill */}
          <motion.div
            className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-sm">{currentStatus.subtitle}</span>
            {orderStatus === 'preparing' && (
              <>
                <span className="w-1 h-1 rounded-full bg-white" />
                <span className="text-sm text-orange-200">On time</span>
              </>
            )}
            <motion.button
              onClick={handleRefresh}
              className="ml-1"
              animate={{ rotate: isRefreshing ? 360 : 0 }}
              transition={{ duration: 0.5 }}
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </motion.div>
        </div>
      </motion.div>

      {/* Map Section */}
      <DeliveryMap
        orderId={orderId}
        order={order}
        isVisible={!showConfirmation && order !== null}
      />

      {/* Scrollable Content */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 space-y-4 md:space-y-6 pb-24 md:pb-32">
        {/* 1-minute cancellation window after admin acceptance */}
        {isAdminAccepted && (
          <motion.div
            className="bg-white rounded-xl p-4 shadow-sm border border-orange-100"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">
                Cancel order
              </p>
              <span className={`text-sm font-bold px-2 py-1 rounded-md ${isEditWindowOpen ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                {isEditWindowOpen ? editWindowText : 'Expired'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Available for 1 minute after admin acceptance.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                onClick={handleCancelOrder}
                disabled={!isEditWindowOpen}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                Cancel Order
              </Button>
            </div>
          </motion.div>
        )}

        {/* Food Cooking Status - Show until delivery partner accepts pickup */}
        {(() => {
          // Check if delivery partner has accepted pickup
          // Delivery partner accepts when status is 'ready' or 'out_for_delivery' or tracking shows outForDelivery
          const hasAcceptedPickup = order?.tracking?.outForDelivery?.status === true ||
            order?.tracking?.out_for_delivery?.status === true ||
            order?.status === 'out_for_delivery' ||
            order?.status === 'ready'

          // Show "Food is Cooking" until delivery partner accepts pickup
          if (!hasAcceptedPickup) {
            return (
              <motion.div
                className="bg-white rounded-xl p-4 shadow-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={circleIcon}
                      alt="Food cooking"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="font-semibold text-gray-900">Food is Cooking</p>
                </div>
              </motion.div>
            )
          }

          // Don't show card if delivery partner has accepted pickup
          return null
        })()}



        {/* Delivery Details Banner */}
        <motion.div
          className="bg-yellow-50 rounded-xl p-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <p className="text-yellow-800 font-medium">
            All your delivery details in one place 👋
          </p>
        </motion.div>

        {/* Payment QR Code */}
        {['pickup', 'delivered'].includes(orderStatus) && (
          <motion.div
            className="bg-white rounded-xl shadow-sm overflow-hidden p-4 border border-gray-100 flex flex-col items-center justify-center gap-3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.68 }}
          >
            <p className="text-sm font-bold text-gray-900 uppercase tracking-widest text-center w-full pb-2 border-b border-gray-100 border-dashed">
              Scan to Pay Rider
            </p>
            <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl overflow-hidden border-2 border-orange-100 shadow-sm p-2">
              <img 
                src="/qr%20code.jpeg" 
                alt="Payment QR Code" 
                className="w-full h-full object-contain"
                onError={(e) => e.target.style.display = 'none'}
              />
            </div>
            <p className="text-xs text-gray-500 font-medium text-center">
              Please verify payment with the delivery partner
            </p>
          </motion.div>
        )}

        {/* Contact & Address Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <SectionItem
            icon={Phone}
            title={
              hasDeliveryPartner
                ? (deliveryPartnerName || 'Delivery Partner')
                : 'Delivery boy will be assigned soon'
            }
            subtitle={
              hasDeliveryPartner
                ? (deliveryPartnerPhone || 'Phone number not available')
                : ''
            }
            onClick={hasDeliveryPartner ? handleCallDeliveryPartner : () => toast.info('Delivery partner will be assigned soon')}
            showArrow={false}
            rightContent={
              hasDeliveryPartner ? (
                <span
                  className={`ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${deliveryPartnerPhone ? 'bg-orange-50 text-[#EB590E]' : 'bg-gray-100 text-gray-400'}`}
                >
                  Call
                </span>
              ) : null
            }
          />
          {hasDeliveryPartner && (
            <SectionItem
              icon={MessageSquare}
              title="Chat with delivery partner"
              subtitle="Message in real time"
              onClick={handleOpenDeliveryChat}
              showArrow={false}
              rightContent={
                <span className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-gray-900 text-white">
                  Chat
                </span>
              }
            />
          )}
          <SectionItem
            icon={IndianRupee}
            title="Add tip for delivery partner"
            subtitle={Number(order?.customerTip || 0) > 0 ? `₹${Number(order.customerTip).toFixed(2)} added` : "Tap to add tip"}
            onClick={() => setShowTipDialog(true)}
            showArrow={true}
          />
          <SectionItem
            icon={HomeIcon}
            title="Delivery at Location"
            onClick={() => setShowLocationDialog(true)}
            subtitle={(() => {
              // Priority 1: Use order address formattedAddress (live location address)
              if (order?.address?.formattedAddress && order.address.formattedAddress !== "Select location") {
                return order.address.formattedAddress
              }

              // Priority 2: Build full address from order address parts
              if (order?.address) {
                const orderAddressParts = []
                if (order.address.street) orderAddressParts.push(order.address.street)
                if (order.address.additionalDetails) orderAddressParts.push(order.address.additionalDetails)
                if (order.address.city) orderAddressParts.push(order.address.city)
                if (order.address.state) orderAddressParts.push(order.address.state)
                if (order.address.zipCode) orderAddressParts.push(order.address.zipCode)
                if (orderAddressParts.length > 0) {
                  return orderAddressParts.join(', ')
                }
              }

              // Priority 3: Use defaultAddress formattedAddress (live location address)
              if (defaultAddress?.formattedAddress && defaultAddress.formattedAddress !== "Select location") {
                return defaultAddress.formattedAddress
              }

              // Priority 4: Build full address from defaultAddress parts
              if (defaultAddress) {
                const defaultAddressParts = []
                if (defaultAddress.street) defaultAddressParts.push(defaultAddress.street)
                if (defaultAddress.additionalDetails) defaultAddressParts.push(defaultAddress.additionalDetails)
                if (defaultAddress.city) defaultAddressParts.push(defaultAddress.city)
                if (defaultAddress.state) defaultAddressParts.push(defaultAddress.state)
                if (defaultAddress.zipCode) defaultAddressParts.push(defaultAddress.zipCode)
                if (defaultAddressParts.length > 0) {
                  return defaultAddressParts.join(', ')
                }
              }

              return 'Add delivery address'
            })()}
          />
          {canUpdateLocation && (
            <div className="px-4 pb-4">
              <Button
                type="button"
                onClick={() => setShowLocationDialog(true)}
                disabled={!canUpdateLocation}
                className="w-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
              >
                Update Delivery Location
              </Button>
              {!canUpdateLocation && (
                <p className="text-xs text-gray-500 mt-2">
                  {locationUpdateBlockedReason}
                </p>
              )}
            </div>
          )}
          {(order?.deliveryInstruction || canUpdateLocation) && (
            <SectionItem
              icon={MessageSquare}
              title={canUpdateLocation ? "Add delivery instructions" : "Delivery instructions"}
              subtitle={order?.deliveryInstruction 
                ? order.deliveryInstruction 
                : (canUpdateLocation ? "Tap to add instructions" : "Cannot add instructions in this state")}
              onClick={() => setShowDeliveryInstructionModal(true)}
              showArrow={canUpdateLocation}
            />
          )}
          {orderStatus === 'delivered' && (
            <SectionItem
              icon={Star}
              title={order?.rating ? "You rated this order" : "Rate this order"}
              subtitle={order?.rating ? `${order.rating} stars` : "Share your feedback"}
              onClick={() => handleOpenRating(order)}
              showArrow={true}
            />
          )}
        </motion.div>

        {/* Restaurant Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <div className="flex items-center gap-3 p-4 border-b border-dashed border-gray-200">
            <div className="w-12 h-12 rounded-full bg-orange-100 overflow-hidden flex items-center justify-center">
              <span className="text-2xl">🍽️</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{order.restaurant}</p>
              <p className="text-sm text-gray-500">{order.address?.city || 'Local Area'}</p>
              {restaurantPhone && (
                <p className="text-sm text-gray-500">{restaurantPhone}</p>
              )}
            </div>
            <motion.button
              type="button"
              onClick={restaurantPhone ? handleCallRestaurant : undefined}
              className={`w-10 h-10 rounded-full flex items-center justify-center ${restaurantPhone ? 'bg-orange-50' : 'bg-gray-100'}`}
              whileTap={{ scale: 0.9 }}
            >
              <Phone className={`w-5 h-5 ${restaurantPhone ? 'text-[#EB590E]' : 'text-gray-400'}`} />
            </motion.button>
          </div>

          {/* Order Items */}
          <div
            className="p-4 border-b border-dashed border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setShowOrderDetails(true)}
          >
            <div className="flex items-start gap-3">
              <Receipt className="w-5 h-5 text-gray-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">Order #{order?.id || order?.orderId || 'N/A'}</p>
                <div className="mt-2 space-y-1">
                  {order?.items?.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="w-4 h-4 rounded border border-green-600 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-green-600" />
                      </span>
                      <span>{item.quantity} x {item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </motion.div>

        {/* Help Section */}
        <motion.div
          className="bg-white rounded-xl shadow-sm overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <SectionItem
            icon={CircleSlash}
            title="Cancel order"
            subtitle=""
            onClick={handleCancelOrder}
          />
        </motion.div>

      </div>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Cancel Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-6 px-2">
            <div className="space-y-2 w-full">
              <Textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="e.g., Changed my mind, Wrong address, etc."
                className="w-full min-h-[100px] resize-none border-2 border-gray-300 rounded-lg px-4 py-3 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200"
                disabled={isCancelling}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancellationReason("");
                }}
                disabled={isCancelling}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmCancel}
                disabled={isCancelling || !cancellationReason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Delivery Location Dialog */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="sm:max-w-xl w-[95%] max-w-[600px] p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              {canUpdateLocation ? "Update Delivery Location" : "Delivery Location"}
            </DialogTitle>
          </DialogHeader>
          {canUpdateLocation ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Full Address</p>
                <Textarea
                  value={locationForm.formattedAddress}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, formattedAddress: e.target.value }))}
                  placeholder="Enter complete delivery address"
                  className="min-h-[90px] block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-neutral-900 focus-visible:ring-neutral-900/40 focus-visible:ring-[3px] md:text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={locationForm.street}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, street: e.target.value }))}
                  placeholder="Street"
                />
                <Input
                  value={locationForm.additionalDetails}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, additionalDetails: e.target.value }))}
                  placeholder="Additional details"
                />
                <Input
                  value={locationForm.city}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
                <Input
                  value={locationForm.state}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, state: e.target.value }))}
                  placeholder="State"
                />
                <Input
                  value={locationForm.zipCode}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, zipCode: e.target.value }))}
                  placeholder="Zip Code"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  type="number"
                  value={locationForm.lat}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, lat: e.target.value }))}
                  placeholder="Latitude"
                />
                <Input
                  type="number"
                  value={locationForm.lng}
                  onChange={(e) => setLocationForm((prev) => ({ ...prev, lng: e.target.value }))}
                  placeholder="Longitude"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUseCurrentLocation}
                  disabled={locationLoading}
                  className="flex-1"
                >
                  Use Current Location
                </Button>
                <Button
                  type="button"
                  onClick={handleUpdateLocation}
                  disabled={isUpdatingLocation || !canUpdateLocation}
                  className="flex-1 bg-gray-900 text-white hover:bg-gray-800"
                >
                  {isUpdatingLocation ? "Updating..." : "Update Location"}
                </Button>
              </div>
              {!canUpdateLocation && (
                <p className="text-xs text-gray-500">
                  {locationUpdateBlockedReason}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6 py-6 px-1 text-left">
              <div className="flex items-start gap-4 p-5 bg-orange-50/50 rounded-2xl border border-orange-100">
                <MapPin className="w-6 h-6 text-[#EB590E] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-[#EB590E] uppercase tracking-widest">
                    Delivery Address
                  </p>
                  <p className="text-gray-900 font-semibold leading-relaxed mt-1.5 text-base">
                    {locationForm.formattedAddress || order?.address?.formattedAddress || "No address details available"}
                  </p>
                  {(locationForm.city || locationForm.zipCode) && (
                     <p className="text-sm text-gray-500 mt-2 font-medium">
                       {[locationForm.city, locationForm.zipCode].filter(Boolean).join(" - ")}
                     </p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Order Info</p>
                </div>
                <p className="text-sm text-gray-600">
                  Location updates are only available until the order is prepared.
                </p>
              </div>

              <Button
                onClick={() => setShowLocationDialog(false)}
                className="w-full bg-gray-900 text-white h-12 rounded-xl font-bold hover:bg-gray-800 transition-all active:scale-[0.98]"
              >
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDeliveryInstructionModal} onOpenChange={setShowDeliveryInstructionModal}>
        <DialogContent className="sm:max-w-md w-[95%] p-0 overflow-hidden border-none bg-white dark:bg-[#1a1a1a] rounded-3xl shadow-2xl">
          <div className="bg-gradient-to-r from-[#EB590E] to-[#ff8c42] p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogHeader className="p-0 border-none space-y-0 text-left">
                  <DialogTitle className="text-xl font-bold text-white pr-8">
                    Delivery Instructions
                  </DialogTitle>
                  <p className="text-orange-50 text-xs mt-0.5">Help our partner find you easily</p>
                </DialogHeader>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Your Instructions</label>
                <div className="relative group">
                  <Textarea
                    value={deliveryInstructionText}
                    onChange={(e) => setDeliveryInstructionText(e.target.value)}
                    placeholder="Ex: Ring once, call on arrival, leave at gate, etc."
                    className={`w-full min-h-[120px] resize-none border-gray-100 bg-gray-50/50 rounded-2xl p-4 text-gray-900 focus:bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-300 ${!canUpdateLocation ? 'bg-gray-100/50 border-dashed cursor-not-allowed opacity-80' : ''}`}
                    maxLength={200}
                    readOnly={!canUpdateLocation}
                  />
                  {canUpdateLocation && (
                    <div className="absolute bottom-3 right-3">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${deliveryInstructionText.length >= 200 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                        {deliveryInstructionText.length}/200
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {!canUpdateLocation && (
                <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 mt-1.5 animate-pulse" />
                  <p className="text-xs text-orange-800 leading-relaxed font-medium">
                    Instructions cannot be modified in this state.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeliveryInstructionModal(false)}
                className="flex-1 h-12 rounded-xl border-gray-200 text-gray-600 font-bold hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                Close
              </Button>
              {canUpdateLocation && (
                <Button
                  onClick={handleSaveDeliveryInstruction}
                  disabled={isSavingInstruction}
                  className="flex-1 h-12 rounded-xl bg-gray-900 text-white font-bold shadow-lg shadow-gray-200 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {isSavingInstruction ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </div>
                  ) : (
                    'Save'
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTipDialog} onOpenChange={setShowTipDialog}>
        <DialogContent className="sm:max-w-md w-[95%] p-0 overflow-hidden border-none bg-white dark:bg-[#1a1a1a] rounded-3xl shadow-2xl">
          <div className="bg-gradient-to-r from-[#EB590E] to-[#ff8c42] p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
                <IndianRupee className="w-6 h-6 text-white" />
              </div>
              <div>
                <DialogHeader className="p-0 border-none space-y-0 text-left">
                  <DialogTitle className="text-xl font-bold text-white pr-8">
                    Add tip
                  </DialogTitle>
                  <p className="text-orange-50 text-xs mt-0.5">Support your delivery partner</p>
                </DialogHeader>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-4 gap-2">
              {[20, 30, 50, 100].map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  onClick={() => setTipAmount(String(amount))}
                  className={`rounded-xl ${Number(tipAmount) === amount ? "border-[#EB590E] text-[#EB590E]" : ""}`}
                >
                  ₹{amount}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Custom Tip Amount</label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Enter tip amount"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowTipDialog(false)}
                className="flex-1 h-12 rounded-xl border-gray-200 text-gray-600 font-bold hover:bg-gray-50 active:scale-[0.98] transition-all"
              >
                Close
              </Button>
              <Button
                onClick={handleSaveCustomerTip}
                disabled={isSavingTip}
                className="flex-1 h-12 rounded-xl bg-gray-900 text-white font-bold shadow-lg shadow-gray-200 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isSavingTip ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </div>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-[calc(100vw-32px)] sm:max-w-md bg-white rounded-2xl p-0 overflow-hidden border-none outline-none">
          <DialogHeader className="p-6 pb-4 border-b border-gray-100 pr-12">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold text-gray-900">Order Details</DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-6 pt-4 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Order Meta Info */}
            <div className="flex flex-col gap-1 b">
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Order ID</p>
              <p className="font-mono text-gray-900 font-semibold">#{order?.id || order?.orderId}</p>
              <div className="flex items-center gap-4 mt-2">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Date & Time</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order?.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    }) : 'N/A'}
                  </p>
                </div>
                <div className="h-8 w-px bg-gray-100" />
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
                  <span className="text-sm font-bold text-green-600 uppercase">
                    {order?.status?.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Items Section */}
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Order Items</p>
              <div className="space-y-4">
                {order?.items?.map((item, index) => (
                  <div key={index} className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-5 h-5 rounded border border-green-600 flex items-center justify-center mt-0.5 shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 leading-tight">{item.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">Quantity: {item.quantity}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900">₹{item.price * item.quantity}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-1">Bill Summary</p>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Item Total</span>
                <span className="text-gray-900 font-medium">₹{order?.totalAmount - (order?.deliveryFee || 0) - (order?.gst || 0) - (order?.platformFee || 0)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="text-gray-900 font-medium">₹{order?.deliveryFee || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Platform Fee</span>
                <span className="text-gray-900 font-medium">₹{order?.platformFee || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Taxes & Charges</span>
                <span className="text-gray-900 font-medium">₹{order?.gst || 0}</span>
              </div>
              {Number(order?.customerTip || 0) > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Customer Tip</span>
                  <span className="text-green-600 font-medium">+₹{order?.customerTip}</span>
                </div>
              )}
              <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total Amount</span>
                <span className="text-lg font-bold text-gray-900">₹{(order?.totalAmount || 0) + Number(order?.customerTip || 0)}</span>
              </div>
            </div>

            {/* Payment Method */}
            {order?.paymentMethod && (
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-medium">Payment Method</span>
                </div>
                <span className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  {order.paymentMethod}
                </span>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-gray-100">
            <Button
              onClick={() => setShowOrderDetails(false)}
              className="w-full bg-gray-900 text-white font-bold h-12 rounded-xl"
            >
              Okay
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rating & Feedback Modal */}
      {ratingModal.open && ratingModal.order && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-[#EB590E] to-[#D94F0C] px-6 py-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 fill-white" />
                  Rate Your Order
                </h2>
                <button
                  type="button"
                  onClick={handleCloseRating}
                  className="text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/20"
                >
                  <span className="text-xl">✕</span>
                </button>
              </div>
              <p className="text-sm text-white/90">
                {ratingModal.order.restaurant} • Order #{ratingModal.order.id || ratingModal.order.orderId}
              </p>
            </div>

            <div className="px-6 py-6">
              {/* Star rating (1-5) */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-4 text-center">
                  How was your overall experience?
                </p>
                <div className="flex items-center justify-center gap-2 mb-3">
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((num) => {
                    const isActive = (selectedRating || 0) >= num
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSelectedRating(num)}
                        className="p-2 transition-transform hover:scale-125 active:scale-95"
                      >
                        <Star
                          className={`w-10 h-10 transition-all ${isActive
                              ? "text-yellow-400 fill-yellow-400 drop-shadow-lg"
                              : "text-gray-300 hover:text-yellow-200"
                            }`}
                        />
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between mt-2 px-2">
                  <span className="text-xs text-red-500 font-medium">Poor</span>
                  <span className="text-xs text-gray-400">Average</span>
                  <span className="text-xs text-green-600 font-medium">Excellent</span>
                </div>
                {selectedRating && (
                  <p className="text-center mt-3 text-sm font-medium text-gray-700">
                    {selectedRating === 5 && "⭐⭐⭐⭐⭐ Excellent!"}
                    {selectedRating === 4 && "⭐⭐⭐⭐ Great!"}
                    {selectedRating === 3 && "⭐⭐⭐ Good"}
                    {selectedRating === 2 && "⭐⭐ Fair"}
                    {selectedRating === 1 && "⭐ Poor"}
                  </p>
                )}
              </div>

              {/* Feedback text area */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Share your feedback <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <Textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="What did you like or dislike? How was the food and delivery?"
                  className="w-full resize-none min-h-[100px] border-2 border-gray-100 rounded-xl focus:border-orange-500/50 focus:ring-4 focus:ring-orange-500/10 transition-all text-sm p-3 placeholder:text-gray-400"
                  maxLength={500}
                />
                <p className="text-xs text-gray-400 mt-1">Your feedback helps us improve our service.</p>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={handleCloseRating}
                  className="flex-1 h-12 rounded-xl border-2 border-gray-100 font-bold hover:bg-gray-50 hover:text-gray-900 active:scale-95 transition-all text-gray-600"
                  disabled={submittingRating}
                >
                  Skip
                </Button>
                <Button
                  onClick={handleSubmitRating}
                  disabled={submittingRating || selectedRating === null}
                  className="flex-1 h-12 rounded-xl bg-gray-900 text-white font-bold shadow-lg shadow-gray-200 hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                >
                  {submittingRating ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting...</span>
                    </div>
                  ) : (
                    "Submit Review"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
