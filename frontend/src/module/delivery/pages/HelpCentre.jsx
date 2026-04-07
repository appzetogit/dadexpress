import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ChevronLeft, 
  ChevronRight,
  PhoneCall,
  MessageCircle, // For WhatsApp
  Ticket,
  IdCard,
  Languages,
  AlertCircle,
  Stethoscope,
  Siren,
  ShieldCheck,
  Loader2,
  LifeBuoy
} from "lucide-react"
import { restaurantAPI } from "@/lib/api"

/**
 * HelpCentre component for the Delivery app
 * Provides a dedicated screen for support and help topics
 */
export default function HelpCentre() {
  const navigate = useNavigate()
  const [supportNumber, setSupportNumber] = useState("")
  const [loading, setLoading] = useState(true)

  // Fetch support number from business settings
  useEffect(() => {
    const fetchSupportNumber = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getBusinessSettingsPublic()
        if (response?.data?.success && response?.data?.data?.settings?.supportPhoneNumber) {
          setSupportNumber(response.data.data.settings.supportPhoneNumber)
        }
      } catch (err) {
        console.warn("Error fetching support number for HelpCentre:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchSupportNumber()
  }, [])

  const helpTopics = [
    {
      id: "tickets",
      title: "Support Tickets",
      subtitle: "Check status or raise new tickets",
      icon: <Ticket className="w-5 h-5 text-indigo-600" />,
      path: "/delivery/help/tickets",
      color: "bg-indigo-50"
    },
    {
      id: "idcard",
      title: "Your ID Card",
      subtitle: "View and present your rider ID",
      icon: <IdCard className="w-5 h-5 text-emerald-600" />,
      path: "/delivery/help/id-card",
      color: "bg-emerald-50"
    },
    {
      id: "language",
      title: "App Language",
      subtitle: "Change app language preference",
      icon: <Languages className="w-5 h-5 text-amber-600" />,
      path: "/delivery/help/language",
      color: "bg-amber-50"
    }
  ]

  const emergencyLinks = [
    {
      id: "ambulance",
      title: "Call Ambulance",
      subtitle: "Primary medical emergency",
      icon: <Stethoscope className="w-5 h-5 text-red-600" />,
      phone: "108"
    },
    {
      id: "accident",
      title: "Call Helpline",
      subtitle: "Accident helpline support",
      icon: <Siren className="w-5 h-5 text-blue-600" />,
      phone: "1073"
    },
    {
      id: "police",
      title: "Call Police",
      subtitle: "Emergency security help",
      icon: <ShieldCheck className="w-5 h-5 text-amber-600" />,
      phone: "100"
    }
  ]

  const normalizePhoneNumber = (phone) => {
    if (!phone) return ""
    const digits = String(phone).replace(/\D/g, "")
    // Keep emergency numbers as is (100, 108, etc)
    if (digits.length <= 4) return digits
    if (digits.length > 10 && digits.startsWith("91")) {
      return digits.slice(-10)
    }
    return digits
  }

  const handleCallSupport = () => {
    if (supportNumber) {
      window.location.href = `tel:${normalizePhoneNumber(supportNumber)}`
    }
  }

  const handleWhatsAppSupport = () => {
    if (supportNumber) {
      const cleanNumber = supportNumber.replace(/[^\d]/g, "")
      window.open(`https://wa.me/${cleanNumber.startsWith("+") ? cleanNumber : "+91" + cleanNumber}`, "_blank")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate("/delivery")}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Help Center</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Support Banner */}
        <div className="bg-black rounded-2xl p-6 text-white relative overflow-hidden shadow-lg">
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">How can we help?</h2>
            <p className="text-white/70 text-sm mb-6">Our support team is always here for you</p>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleCallSupport}
                disabled={loading || !supportNumber}
                className="flex items-center justify-center gap-2 bg-white text-black py-3 rounded-xl font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <PhoneCall className="w-4 h-4" />
                Call Now
              </button>
              <button 
                onClick={handleWhatsAppSupport}
                disabled={loading || !supportNumber}
                className="flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
            </div>
          </div>
          {/* Abstract background shape */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full blur-2xl -ml-12 -mb-12"></div>
        </div>

        {/* Support Topics */}
        <div className="grid grid-cols-1 gap-3">
          <h3 className="text-gray-900 font-bold px-1">Support Topics</h3>
          {helpTopics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => navigate(topic.path)}
              className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-gray-300 transition-all text-left"
            >
              <div className={`w-12 h-12 rounded-xl ${topic.color} flex items-center justify-center shrink-0`}>
                {topic.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-bold truncate">{topic.title}</p>
                <p className="text-gray-500 text-xs truncate">{topic.subtitle}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </button>
          ))}
        </div>

        {/* Emergency Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 px-1 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-bold">Emergency Help</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {emergencyLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => window.location.href = `tel:${normalizePhoneNumber(link.phone)}`}
                className="flex flex-col gap-3 bg-white p-5 rounded-xl border border-red-50 shadow-sm hover:bg-red-50/50 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                  {link.icon}
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-sm">{link.title}</p>
                  <p className="text-gray-500 text-[10px]">{link.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* FAQs Placeholder */}
        <div className="pt-4  text-center">
            <div className="bg-gray-100 rounded-2xl p-8 flex flex-col items-center justify-center border border-dashed border-gray-300">
                <LifeBuoy className="w-10 h-10 text-gray-400 mb-3" />
                <p className="text-gray-900 font-bold text-sm">Need more help?</p>
                <p className="text-gray-500 text-xs text-center mt-1">Visit our website or contact your fleet manager for specialized help</p>
            </div>
        </div>
      </div>
    </div>
  )
}
