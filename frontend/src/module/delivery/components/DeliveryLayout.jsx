import { useLocation } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { Bell, X } from "lucide-react"
import BottomNavigation from "./BottomNavigation"
import {
  addDeliveryNotification,
  getUnreadDeliveryNotificationCount
} from "../utils/deliveryNotifications"
import { useDeliveryNotificationContext } from "../context/DeliveryNotificationContext"

export default function DeliveryLayout({
  children,
  showGig = false,
  showPocket = false,
  onHomeClick,
  onGigClick
}) {
  const location = useLocation()
  const { newOrder } = useDeliveryNotificationContext()
  const [requestBadgeCount, setRequestBadgeCount] = useState(() =>
    getUnreadDeliveryNotificationCount()
  )
  const [incomingOrderBanner, setIncomingOrderBanner] = useState(null)
  const shownIncomingOrderIdsRef = useRef(new Set())

  // Update badge count when location changes
  useEffect(() => {
    setRequestBadgeCount(getUnreadDeliveryNotificationCount())

    // Listen for notification updates
    const handleNotificationUpdate = () => {
      setRequestBadgeCount(getUnreadDeliveryNotificationCount())
    }

    window.addEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
    window.addEventListener('storage', handleNotificationUpdate)

    return () => {
      window.removeEventListener('deliveryNotificationsUpdated', handleNotificationUpdate)
      window.removeEventListener('storage', handleNotificationUpdate)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!newOrder) return
    if (location.pathname === "/delivery") return

    let activeOrder = null
    try {
      const rawActiveOrder = localStorage.getItem("deliveryActiveOrder")
      activeOrder = rawActiveOrder ? JSON.parse(rawActiveOrder) : null
    } catch {
      activeOrder = null
    }

    const activeOrderId =
      activeOrder?.orderId ||
      activeOrder?.restaurantInfo?.orderMongoId ||
      activeOrder?.restaurantInfo?.id ||
      activeOrder?.restaurantInfo?.orderId ||
      null

    if (!activeOrderId) return

    const incomingOrderId =
      newOrder?.orderMongoId ||
      newOrder?.orderId ||
      newOrder?.id ||
      null

    if (!incomingOrderId) return
    if (String(activeOrderId) === String(incomingOrderId)) return
    if (shownIncomingOrderIdsRef.current.has(String(incomingOrderId))) return

    shownIncomingOrderIdsRef.current.add(String(incomingOrderId))

    const amount = Number(
      newOrder?.estimatedEarnings?.totalEarning ??
      newOrder?.estimatedEarnings ??
      newOrder?.deliveryFee ??
      0
    ) || 0

    const bannerData = {
      id: String(incomingOrderId),
      name: newOrder?.restaurantName || newOrder?.name || "Restaurant",
      address:
        newOrder?.restaurantAddress ||
        newOrder?.restaurantLocation?.address ||
        "Order notification received while another order is active",
      amount
    }

    setIncomingOrderBanner(bannerData)
    addDeliveryNotification({
      type: "order",
      title: "New Order Request",
      message: `${bannerData.name} sent a new delivery request${amount > 0 ? ` • Est. earning ₹${amount.toFixed(2)}` : ""}`,
      time: "Just now"
    })
  }, [location.pathname, newOrder])

  useEffect(() => {
    if (!incomingOrderBanner) return undefined

    const timeoutId = setTimeout(() => {
      setIncomingOrderBanner(null)
    }, 12000)

    return () => clearTimeout(timeoutId)
  }, [incomingOrderBanner])

  // Pages where bottom navigation should be shown
  const showBottomNav = [
    '/delivery',
    '/delivery/requests',
    '/delivery/trip-history',
    '/delivery/profile'
  ].includes(location.pathname)

  return (
    <>
      {incomingOrderBanner && location.pathname !== "/delivery" && (
        <div className="fixed top-20 left-4 right-4 z-[300]">
          <div className="rounded-2xl bg-white border border-green-100 shadow-xl px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-600">New order request</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {incomingOrderBanner.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {incomingOrderBanner.address}
                  </p>
                  <p className="text-xs font-medium text-gray-700 mt-1">
                    Est. earning ₹{incomingOrderBanner.amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIncomingOrderBanner(null)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Dismiss incoming order notification"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      )}
      <main>
        {children}
      </main>
      {showBottomNav && (
        <BottomNavigation
          showGig={showGig}
          showPocket={showPocket}
          onHomeClick={onHomeClick}
          onGigClick={onGigClick}
          requestBadgeCount={requestBadgeCount}
        />
      )}
    </>
  )
}

