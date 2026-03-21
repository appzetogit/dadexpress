import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Send, Loader2, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import io from 'socket.io-client'
import { BACKEND_BASE_URL } from "@/lib/api/config"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"

export default function ChatDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('orderId')
  const chatType = searchParams.get('type') // 'customer' or 'restaurant'
  const userId = searchParams.get('userId')
  const restaurantId = searchParams.get('restaurantId')
  
  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [deliveryPartnerId, setDeliveryPartnerId] = useState(null)
  const [fetchingDeliveryId, setFetchingDeliveryId] = useState(true)
  const messagesEndRef = useRef(null)
  const socketRef = useRef(null)
  const chatRoomRef = useRef(null)

  // Fetch delivery partner ID from API
  useEffect(() => {
    const fetchDeliveryPartnerId = async () => {
      try {
        setFetchingDeliveryId(true)
        const response = await deliveryAPI.getCurrentDelivery()
        if (response?.data?.success && response?.data?.data) {
          const deliveryPartner = response.data.data.user || response.data.data.deliveryPartner || response.data.data
          if (deliveryPartner) {
            const id = deliveryPartner.id?.toString() || 
                      deliveryPartner._id?.toString() || 
                      deliveryPartner.deliveryId
            if (id) {
              setDeliveryPartnerId(id)
            } else {
              toast.error("Delivery partner ID not found in response")
            }
          } else {
            toast.error("Delivery partner data not found")
          }
        } else {
          toast.error("Failed to fetch delivery partner information")
        }
      } catch (error) {
        console.error('Error fetching delivery partner ID:', error)
        toast.error("Failed to load delivery partner information")
      } finally {
        setFetchingDeliveryId(false)
      }
    }
    fetchDeliveryPartnerId()
  }, [])

  // Initialize socket connection
  useEffect(() => {
    if (!orderId) {
      toast.error("Order ID is required")
      navigate("/delivery/profile/conversation")
      return
    }

    if (!deliveryPartnerId) {
      // Wait for delivery partner ID to be fetched
      return
    }

    const backendUrl = BACKEND_BASE_URL
    
    // Create chat room name based on type
    let roomName = ''
    let recipientId = ''
    let recipientName = ''
    
    if (chatType === 'customer' && userId) {
      roomName = `chat:order:${orderId}:delivery:${deliveryPartnerId}:user:${userId}`
      recipientId = userId
      recipientName = 'Customer'
    } else if (chatType === 'restaurant' && restaurantId) {
      roomName = `chat:order:${orderId}:delivery:${deliveryPartnerId}:restaurant:${restaurantId}`
      recipientId = restaurantId
      recipientName = 'Restaurant'
    } else {
      toast.error("Invalid chat parameters")
      navigate("/delivery/profile/conversation")
      return
    }

    chatRoomRef.current = roomName

    // Initialize socket connection
    socketRef.current = io(backendUrl, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      auth: {
        token: localStorage.getItem('delivery_accessToken') || localStorage.getItem('accessToken')
      }
    })

    socketRef.current.on('connect', () => {
      console.log('✅ Chat socket connected')
      setConnected(true)
      
      // Join chat room
      socketRef.current.emit('join-chat-room', {
        room: roomName,
        orderId,
        deliveryPartnerId,
        recipientId,
        chatType
      })

      // Load previous messages
      socketRef.current.emit('get-chat-messages', {
        room: roomName,
        orderId
      })
    })

    socketRef.current.on('chat-room-joined', (data) => {
      console.log('✅ Joined chat room:', data)
    })

    socketRef.current.on('chat-messages', (data) => {
      if (data.messages && Array.isArray(data.messages)) {
        setMessages(data.messages)
        setLoading(false)
        setTimeout(() => scrollToBottom(), 100)
      }
    })

    socketRef.current.on('new-message', (data) => {
      if (data.room === roomName) {
        setMessages(prev => [...prev, data.message])
        setTimeout(() => scrollToBottom(), 100)
      }
    })

    socketRef.current.on('message-deleted', (data) => {
      if (data?.room === roomName && data?.messageId) {
        setMessages((prev) => prev.filter((m) => String(m?._id) !== String(data.messageId)))
      }
    })

    socketRef.current.on('message-sent', (data) => {
      if (data.success) {
        // Message sent successfully, it will be received via 'new-message' event
      } else {
        toast.error("Failed to send message")
      }
    })

    socketRef.current.on('connect_error', (error) => {
      console.error('❌ Chat socket connection error:', error)
      setConnected(false)
      toast.error("Failed to connect to chat")
    })

    socketRef.current.on('disconnect', () => {
      console.log('❌ Chat socket disconnected')
      setConnected(false)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-chat-room', { room: roomName })
        socketRef.current.disconnect()
      }
    }
  }, [orderId, chatType, userId, restaurantId, deliveryPartnerId, navigate])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!message.trim() || !socketRef.current || !connected || !deliveryPartnerId) {
      return
    }

    const messageData = {
      room: chatRoomRef.current,
      orderId,
      senderId: deliveryPartnerId,
      senderType: 'delivery',
      recipientId: chatType === 'customer' ? userId : restaurantId,
      recipientType: chatType,
      text: message.trim(),
      timestamp: new Date().toISOString()
    }

    // Keep UI single-source from socket event to avoid duplicate bubbles
    setMessage("")
    scrollToBottom()

    // Send message via socket
    socketRef.current.emit('send-message', messageData)
  }

  const handleDeleteMessage = (messageId) => {
    if (!socketRef.current || !connected || !chatRoomRef.current || !messageId) return
    socketRef.current.emit('delete-chat-message', {
      room: chatRoomRef.current,
      messageId: String(messageId),
      deletedBy: deliveryPartnerId
    })
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${ampm}`
  }

  const getRecipientName = () => {
    if (chatType === 'customer') {
      return 'Customer'
    } else if (chatType === 'restaurant') {
      return 'Restaurant'
    }
    return 'Chat'
  }

  if (fetchingDeliveryId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-900 animate-spin mx-auto mb-4" />
          <p className="text-gray-700">Loading...</p>
        </div>
      </div>
    )
  }

  if (!deliveryPartnerId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-red-600 mb-4">Failed to load delivery partner information</p>
          <button
            onClick={() => navigate("/delivery/profile/conversation")}
            className="px-4 py-2 bg-black text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-3 flex items-center gap-4 sticky top-0 z-10">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg md:text-xl font-bold text-gray-900">{getRecipientName()}</h1>
          <p className="text-xs text-gray-500">Order #{orderId}</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          ) : (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-900 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg, index) => {
              const isMe = msg.senderType === 'delivery' && msg.senderId === deliveryPartnerId
              
              return (
                <motion.div
                  key={msg._id || `msg-${index}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg?._id)}
                      disabled={!connected || !msg?._id}
                      className="p-1 rounded-full hover:bg-gray-200 disabled:opacity-40"
                      aria-label="Delete message"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <div className={`max-w-[75%] md:max-w-[60%] rounded-lg px-4 py-2 ${
                      isMe 
                        ? 'bg-black text-white' 
                        : 'bg-white text-gray-900 border border-gray-200'
                    } ${msg.isSending ? 'opacity-70' : ''}`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                      <p className={`text-xs mt-1 ${
                        isMe ? 'text-white/70' : 'text-gray-500'
                      }`}>
                        {formatTime(msg.timestamp)}
                        {msg.isSending && ' • Sending...'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Fixed at Bottom */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 sticky bottom-0 z-10">
        <div className="flex items-center gap-3">
          <Input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={!connected}
            className="flex-1 rounded-full border border-gray-200 focus:border-black focus:ring-1 focus:ring-black disabled:opacity-50"
          />
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || !connected}
              className="rounded-full bg-black hover:bg-gray-900 text-white p-2.5 w-10 h-10 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

