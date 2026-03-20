import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, Send, Trash2, User } from "lucide-react"
import io from "socket.io-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { BACKEND_BASE_URL } from "@/lib/api/config"
import { authAPI } from "@/lib/api"
import { toast } from "sonner"

export default function UserSupportChat() {
  const navigate = useNavigate()

  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState("Admin Support")
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const roomRef = useRef("")

  const backendUrl = useMemo(() => BACKEND_BASE_URL, [])

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setLoading(true)
        const userRes = await authAPI.getCurrentUser()
        const currentUser = userRes?.data?.data?.user || userRes?.data?.user || userRes?.data || null
        const currentUserId = currentUser?._id?.toString() || currentUser?.id?.toString() || currentUser?.userId?.toString() || null

        if (!currentUserId) {
          toast.error("Please login to chat with support")
          navigate("/auth/sign-in")
          return
        }

        setUserId(currentUserId)
      } catch (error) {
        console.error("Failed to load user info:", error)
        toast.error("Failed to open chat")
        setLoading(false)
      }
    }

    fetchUser()
  }, [navigate])

  useEffect(() => {
    if (!userId) return

    const room = `support:admin:user:${userId}`
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
        userId,
        chatType: "user-admin",
      })
      socketRef.current.emit("get-chat-messages", { room })
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
  }, [backendUrl, userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = () => {
    const text = message.trim()
    if (!text || !socketRef.current || !connected) return

    socketRef.current.emit("send-message", {
      room: roomRef.current,
      senderId: userId,
      senderType: "user",
      recipientType: "admin",
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-full bg-primary-orange/10 flex items-center justify-center">
            <User className="h-6 w-6 text-primary-orange" />
          </div>
          <div>
            <p className="font-bold text-gray-900">{userName}</p>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300"}`} />
              <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                {connected ? "Online" : "Connecting..."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-orange mb-2" />
            <p className="text-sm text-gray-500">Loading conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Send className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Support Chat</h3>
            <p className="text-sm text-gray-500">How can we help you today? Send a message to start chatting with our support team.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMine = msg?.senderType === "user" && String(msg?.senderId) === String(userId)
            return (
              <div key={msg?._id || idx} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                 {isMine && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg?._id)}
                      disabled={!connected || !msg?._id}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-gray-200 disabled:opacity-40 transition-opacity"
                      aria-label="Delete message"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                 )}
                  <div
                    className={`group relative max-w-[85%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                      isMine 
                        ? "bg-primary-orange text-white rounded-br-none" 
                        : "bg-white text-gray-900 border border-gray-100 rounded-bl-none"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg?.text || ""}</p>
                    <p className={`text-[10px] mt-1 text-right font-medium ${isMine ? "text-white/70" : "text-gray-400"}`}>
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

      {/* Input */}
      <div className="bg-white border-t p-4 pb-6 flex items-center gap-3 sticky bottom-0 z-10">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your issue..."
          className="rounded-full border-gray-200 focus:ring-primary-orange focus:border-primary-orange h-11 px-5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
            }
          }}
          disabled={!connected || loading}
        />
        <Button
          size="icon"
          className="bg-primary-orange hover:bg-primary-orange/90 rounded-full h-11 w-11 flex-shrink-0 shadow-md"
          onClick={sendMessage}
          disabled={!connected || loading || !message.trim()}
        >
          <Send className="h-5 w-5 text-white" />
        </Button>
      </div>
    </div>
  )
}
