import { useState, useEffect, useRef, useMemo } from "react"
import { Search, Info, Send, Loader2, User as UserIcon, Trash2 } from "lucide-react"
import io from "socket.io-client"
import { BACKEND_BASE_URL } from "@/lib/api/config"
import { adminAPI } from "@/lib/api"
import { toast } from "sonner"

export default function Chattings() {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchedUserIds, setSearchedUserIds] = useState(null)
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState("")
  const [adminProfile, setAdminProfile] = useState(null)
  
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)
  const backendUrl = useMemo(() => BACKEND_BASE_URL, [])

  const messageKey = (msg) => msg?._id ?? msg?.id

  // Fetch admin profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await adminAPI.getAdminProfile()
        const adminData = response?.data?.data?.admin || response?.data?.admin
        if (adminData) setAdminProfile(adminData)
      } catch (error) {
        console.error("Error fetching admin profile:", error)
      }
    }
    fetchProfile()
  }, [])

  // Socket Connection
  useEffect(() => {
    socketRef.current = io(backendUrl, {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: true,
      auth: {
        token: localStorage.getItem("admin_accessToken") || localStorage.getItem("accessToken"),
      },
    })

    socketRef.current.on("connect", () => {
      setConnected(true)
      console.log("🛡️ Admin Chat Socket Connected")
      socketRef.current.emit("join-admin-support")
      socketRef.current.emit("get-support-conversations")
    })

    socketRef.current.on("support-conversations-list", async (convs) => {
      // Fetch user details for each conversation
      const enhancedConvs = await Promise.all(
        convs.map(async (conv) => {
          try {
            const userRes = await adminAPI.getUserById(conv.userId)
            const user = userRes?.data?.data?.user || userRes?.data?.user
            return {
              ...conv,
              name: user?.name || `User ${conv.userId.substring(0, 5)}`,
              avatar: user?.profileImage || null,
              phone: user?.phone || "N/A",
              type: "customer"
            }
          } catch (err) {
            return { ...conv, name: `User ${conv.userId.substring(0, 5)}`, type: "customer" }
          }
        })
      )
      setConversations(enhancedConvs)
      setLoading(false)
    })

    socketRef.current.on("incoming-support-message", (payload) => {
      // Update conversation list last message
      setConversations((prev) => {
        const index = prev.findIndex((c) => c.room === payload.room)
        if (index !== -1) {
          const updated = [...prev]
          updated[index] = {
            ...updated[index],
            lastMessage: payload.message.text,
            timestamp: payload.message.timestamp,
          }
          // Move to top
          const item = updated.splice(index, 1)[0]
          return [item, ...updated]
        } else {
             // If new conversation, trigger a refresh of list
             socketRef.current.emit("get-support-conversations")
             return prev
        }
      })

      // Active chat: same payload is also delivered via `new-message` (admin is in the room).
      // Only append here if not already present — avoids duplicate rows.
      if (selectedConversation && selectedConversation.room === payload.room) {
        setMessages((prev) => {
          const id = messageKey(payload.message)
          if (!id || prev.some((m) => messageKey(m) === id)) return prev
          return [...prev, payload.message]
        })
      }
    })

    socketRef.current.on("chat-messages", (payload) => {
      if (selectedConversation && payload.room === selectedConversation.room) {
        setMessages(payload.messages || [])
        setMessagesLoading(false)
      }
    })

    socketRef.current.on("new-message", (payload) => {
        if (selectedConversation && payload.room === selectedConversation.room) {
            // Already handled by incoming-support-message if it's admin/user
            // but just to be sure we don't duplicate:
            setMessages((prev) => {
                if (prev.some((m) => messageKey(m) === messageKey(payload.message))) return prev
                return [...prev, payload.message]
            })
        }
    })

    socketRef.current.on("message-deleted", (payload) => {
      if (!selectedConversation || payload?.room !== selectedConversation.room || !payload?.messageId) return
      setMessages((prev) =>
        prev.filter((m) => String(messageKey(m)) !== String(payload.messageId))
      )
    })

    socketRef.current.on("disconnect", () => setConnected(false))

    return () => {
      if (socketRef.current) socketRef.current.disconnect()
    }
  }, [backendUrl, selectedConversation])

  // DB-based search for users in support chat.
  useEffect(() => {
    let cancelled = false
    let timer = null

    const run = async () => {
      const query = searchQuery.trim()
      if (!query) {
        if (!cancelled) setSearchedUserIds(null)
        return
      }
      try {
        const res = await adminAPI.getUsers({ search: query, limit: 100, offset: 0 })
        const users = res?.data?.data?.users || []
        const ids = new Set(users.map((u) => String(u?.id || u?._id)).filter(Boolean))
        if (!cancelled) setSearchedUserIds(ids)
      } catch (error) {
        if (!cancelled) setSearchedUserIds(new Set())
      }
    }

    timer = setTimeout(run, 250)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [searchQuery])

  useEffect(() => {
    if (selectedConversation && socketRef.current) {
      setMessagesLoading(true)
      socketRef.current.emit("join-chat-room", { room: selectedConversation.room })
      socketRef.current.emit("get-chat-messages", { room: selectedConversation.room })
    }
  }, [selectedConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const filteredConversations = conversations.filter(conv => {
    if (conv.type !== "customer") return false

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      const localMatch = conv.name?.toLowerCase().includes(query) || conv.phone?.includes(query)
      if (localMatch) return true
      if (searchedUserIds instanceof Set) {
        return searchedUserIds.has(String(conv.userId))
      }
      return false
    }
    
    return true
  })

  const sendMessage = () => {
    const text = message.trim()
    if (!text || !socketRef.current || !selectedConversation || !adminProfile) return

    socketRef.current.emit("send-message", {
      room: selectedConversation.room,
      senderId: adminProfile._id || adminProfile.id,
      senderType: "admin",
      recipientId: selectedConversation.userId,
      recipientType: "user",
      text,
      timestamp: new Date().toISOString(),
    })
    setMessage("")
  }

  const handleDeleteMessage = (messageId) => {
    if (!socketRef.current || !connected || !selectedConversation?.room || !messageId) return
    socketRef.current.emit("delete-chat-message", {
      room: selectedConversation.room,
      messageId: String(messageId),
      deletedBy: adminProfile?._id || adminProfile?.id || null,
    })
  }

  const formatTime = (ts) => {
    if (!ts) return ""
    const date = new Date(ts)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-8rem)]">
            {/* Left Panel - Conversation List */}
            <div className="border-r border-slate-200 flex flex-col">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-2xl font-bold text-slate-900">Support Chat</h1>
                  <span className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} title={connected ? "Connected" : "Disconnected"} />
                </div>
                
                {/* Search Bar */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Search by name or phone"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 font-medium"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200">
                  <span className="px-4 py-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600">
                    Customers
                  </span>
                </div>
              </div>

              {/* Conversation List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                   <div className="flex flex-col items-center justify-center h-full p-6">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                      <p className="text-sm text-slate-500 font-medium">Loading conversations...</p>
                   </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                      <Info className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-500 font-semibold">No active conversations found</p>
                    <p className="text-xs text-slate-400 mt-1">Users messaging support will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => setSelectedConversation(conversation)}
                        className={`w-full p-4 text-left hover:bg-slate-50 transition-colors ${
                          selectedConversation?.id === conversation.id ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                            {conversation.avatar ? (
                              <img
                                src={conversation.avatar}
                                alt={conversation.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <UserIcon className="w-6 h-6 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <h3 className="text-sm font-bold text-slate-900 truncate">
                                {conversation.name}
                              </h3>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">
                                {formatTime(conversation.timestamp)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-semibold mb-1">
                              {conversation.phone}
                            </p>
                            <p className="text-sm text-slate-600 truncate font-medium">
                              {conversation.lastMessage}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Conversation View */}
            <div className="flex flex-col relative bg-slate-50/30">
              {selectedConversation ? (
                <>
                  {/* Conversation Header */}
                  <div className="p-4 px-6 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100">
                        {selectedConversation.avatar ? (
                          <img
                            src={selectedConversation.avatar}
                            alt={selectedConversation.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-slate-900">{selectedConversation.name}</h2>
                        <div className="flex items-center gap-2">
                           <span className="w-2 h-2 rounded-full bg-green-500" />
                           <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">Active Session</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messagesLoading ? (
                        <div className="flex items-center justify-center h-full">
                           <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-40">
                             <Send className="w-12 h-12 text-slate-300 mb-2" />
                             <p className="text-sm font-bold">No messages yet</p>
                        </div>
                    ) : (
                        messages.map((msg, idx) => {
                            const isMe = msg.senderType === "admin"
                            return (
                                <div key={messageKey(msg) || idx} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                    <div className={`flex items-end gap-1.5 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                          isMe 
                                          ? "bg-blue-600 text-white rounded-br-none" 
                                          : "bg-white text-slate-800 border border-slate-100 rounded-bl-none"
                                      }`}>
                                          <p className="font-medium whitespace-pre-wrap break-words">{msg.text}</p>
                                          <p className={`text-[10px] mt-1 text-right font-bold ${isMe ? "text-blue-100" : "text-slate-400"}`}>
                                              {formatTime(msg.timestamp)}
                                          </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(messageKey(msg))}
                                        disabled={!connected || !messageKey(msg)}
                                        className="p-1 rounded-full hover:bg-slate-200 disabled:opacity-40 transition-colors shrink-0"
                                        aria-label="Delete message"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                                      </button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Message Input */}
                  <div className="p-6 border-t border-slate-200 bg-white">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                        className="flex items-center gap-3"
                    >
                      <input
                        type="text"
                        placeholder="Type a message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-medium"
                      />
                      <button 
                         type="submit"
                         disabled={!message.trim() || !connected}
                         className="px-6 py-3 text-sm font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md disabled:bg-slate-300 disabled:shadow-none"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-12">
                  <div className="text-center max-w-xs">
                    <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
                      <Send className="w-12 h-12 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Your Inbox</h3>
                    <p className="text-sm text-slate-500 font-medium">Select a conversation from the list to start replying to customer queries.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
