import { createContext, useContext } from "react"
import { useDeliveryNotifications } from "../hooks/useDeliveryNotifications"

const DeliveryNotificationContext = createContext(null)

export function DeliveryNotificationProvider({ children }) {
  const notifications = useDeliveryNotifications()

  return (
    <DeliveryNotificationContext.Provider value={notifications}>
      {children}
    </DeliveryNotificationContext.Provider>
  )
}

export function useDeliveryNotificationContext() {
  const context = useContext(DeliveryNotificationContext)

  if (!context) {
    throw new Error("useDeliveryNotificationContext must be used within DeliveryNotificationProvider")
  }

  return context
}

