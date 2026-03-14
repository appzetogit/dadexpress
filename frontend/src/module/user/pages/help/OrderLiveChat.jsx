import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react"
import io from "socket.io-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/api/config"
import { authAPI, orderAPI } from "@/lib/api"
import { toast } from "sonner"

export default function OrderLiveChat() {
  const navigate = useNavigate()
  const { orderId: routeOrderId } = useParams()

  const [userId, setUserId] = useState(null)
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null)
  const [orderId, setOrderId] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const roomRef = useRef("")

  const backendUrl = useMemo(() => API_BASE_URL.replace("/api", ""), [])

  useEffect(() => {
    const fetchParticipants = async () => {
      if (!routeOrderId) return

      try {
        setLoading(true)

        const userRes = await authAPI.getCurrentUser()
        let resolvedOrderId = routeOrderId

        if (routeOrderId === "latest") {
          const ordersRes = await orderAPI.getOrders({ page: 1, limit: 20 })
          const orders =
            ordersRes?.data?.data?.orders ||
            ordersRes?.data?.orders ||
            []

          const latestWithDelivery = Array.isArray(orders)
            ? orders.find((o) => !!(o?.deliveryPartnerId?._id || o?.deliveryPartnerId?.id || o?.deliveryPartnerId))
            : null

          const fallbackLatest = Array.isArray(orders) && orders.length > 0 ? orders[0] : null
          const targetOrder = latestWithDelivery || fallbackLatest
          resolvedOrderId = targetOrder?._id || targetOrder?.orderId || null
        }

        if (!resolvedOrderId) {
          toast.error("No order found for chat")
          setLoading(false)
          return
        }

        const orderRes = await orderAPI.getOrderDetails(resolvedOrderId)

        const currentUser =
          userRes?.data?.data?.user || userRes?.data?.user || userRes?.data || null
        const currentUserId =
          currentUser?._id?.toString() ||
          currentUser?.id?.toString() ||
          currentUser?.userId?.toString() ||
          null

        const order =
          orderRes?.data?.data?.order || orderRes?.data?.order || null
        const deliveryId =
          order?.deliveryPartnerId?._id?.toString() ||
          order?.deliveryPartnerId?.id?.toString() ||
          order?.deliveryPartnerId?.toString() ||
          null

        if (!currentUserId) {
          toast.error("User information not found")
          setLoading(false)
          return
        }
        if (!deliveryId) {
          toast.error("Delivery partner not assigned yet")
          setLoading(false)
          return
        }

        setOrderId(resolvedOrderId)
        setUserId(currentUserId)
        setDeliveryPartnerId(deliveryId)
      } catch (error) {
        console.error("Failed to load chat participants:", error)
        toast.error("Failed to open chat")
        setLoading(false)
      }
    }

    fetchParticipants()
  }, [routeOrderId])

  useEffect(() => {
    if (!orderId || !userId || !deliveryPartnerId) return

    const room = `chat:order:${orderId}:delivery:${deliveryPartnerId}:user:${userId}`
    roomRef.current = room

    socketRef.current = io(backendUrl, {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      auth: {
        token: localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken"),
      },
    })

    socketRef.current.on("connect", () => {
      setConnected(true)
      socketRef.current.emit("join-chat-room", {
        room,
        orderId,
        userId,
        deliveryPartnerId,
        chatType: "user-delivery",
      })
      socketRef.current.emit("get-chat-messages", { room, orderId })
    })

    socketRef.current.on("chat-messages", (payload) => {
      if (payload?.room !== room) return
      setMessages(Array.isArray(payload.messages) ? payload.messages : [])
      setLoading(false)
    })

    socketRef.current.on("new-message", (payload) => {
      if (payload?.room !== room || !payload?.message) return
      setMessages((prev) => [...prev, payload.message])
    })

    socketRef.current.on("message-deleted", (payload) => {
      if (payload?.room !== room || !payload?.messageId) return
      setMessages((prev) => prev.filter((m) => String(m?._id) !== String(payload.messageId)))
    })

    socketRef.current.on("disconnect", () => setConnected(false))
    socketRef.current.on("connect_error", () => {
      setConnected(false)
      setLoading(false)
    })

    return () => {
      if (!socketRef.current) return
      socketRef.current.emit("leave-chat-room", { room })
      socketRef.current.disconnect()
    }
  }, [backendUrl, deliveryPartnerId, orderId, userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = () => {
    const text = message.trim()
    if (!text || !socketRef.current || !connected) return

    socketRef.current.emit("send-message", {
      room: roomRef.current,
      orderId,
      senderId: userId,
      senderType: "user",
      recipientId: deliveryPartnerId,
      recipientType: "delivery",
      text,
      timestamp: new Date().toISOString(),
    })
    setMessage("")
  }

  const handleDeleteMessage = (messageId) => {
    if (!socketRef.current || !connected || !roomRef.current || !messageId) return
    socketRef.current.emit("delete-chat-message", {
      room: roomRef.current,
      messageId: String(messageId),
      deletedBy: userId
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    const hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${ampm}`
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="font-semibold">Delivery Chat</p>
          <p className="text-xs text-gray-500">Order #{orderId || routeOrderId}</p>
        </div>
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-7 w-7 animate-spin text-primary-orange" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-8">No messages yet</div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg?.senderType === "user" && String(msg?.senderId) === String(userId)
            return (
              <div key={msg?._id || idx} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(msg?._id)}
                    disabled={!connected || !msg?._id}
                    className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-40"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                  <div
                    className={`max-w-[78%] px-3 py-2 rounded-xl text-sm ${
                      isMine ? "bg-primary-orange text-white" : "bg-white text-gray-900 border"
                    }`}
                  >
                    {msg?.text || ""}
                    <p className={`text-[11px] mt-1 ${isMine ? "text-white/70" : "text-gray-500"}`}>
                      {formatTime(msg?.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white border-t p-3 flex items-center gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage()
          }}
          disabled={!connected || loading}
        />
        <Button
          className="bg-primary-orange hover:opacity-90"
          onClick={sendMessage}
          disabled={!connected || loading || !message.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

