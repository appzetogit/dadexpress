import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ChevronLeft, 
  ChevronRight,
  PhoneCall,
  Loader2
} from "lucide-react"
import BottomNavOrders from "../components/BottomNavOrders"
import { api, API_ENDPOINTS } from "@/lib/api"

const HELP_CENTRE_PHONE_KEY = "dadexpress_restaurant_help_centre_phone"

const baseHelpTopics = []

export default function HelpCentre() {
  const navigate = useNavigate()
  const [helpCentrePhone, setHelpCentrePhone] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHelpPhone = async () => {
      try {
        setLoading(true)
        // Try to fetch from backend first
        const response = await api.get("/business-settings/public")
        const data = response?.data?.data
        if (data?.phone?.number) {
          const fullPhone = `${data.phone.countryCode || "+91"} ${data.phone.number}`
          setHelpCentrePhone(fullPhone)
          localStorage.setItem(HELP_CENTRE_PHONE_KEY, fullPhone)
        } else {
          // Fallback to localStorage if API fails or phone not set
          const saved = localStorage.getItem(HELP_CENTRE_PHONE_KEY)
          if (saved) setHelpCentrePhone(saved)
        }
      } catch (error) {
        console.error("Error fetching help center phone:", error)
        const saved = localStorage.getItem(HELP_CENTRE_PHONE_KEY)
        if (saved) setHelpCentrePhone(saved)
      } finally {
        setLoading(false)
      }
    }

    fetchHelpPhone()
  }, [])

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white z-50 border-b border-gray-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/restaurant")}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Help centre</h1>
          </div>
          <div className="flex items-center gap-4">
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* How can we help you section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            How can we help you
          </h2>
        </div>

         {/* Help center number */}
         {loading ? (
             <div className="flex justify-center items-center py-4">
                 <Loader2 className="w-6 h-6 animate-spin text-red-600" />
             </div>
         ) : helpCentrePhone.trim() ? (
           <div className="mb-4">
             <div className="w-full flex items-center gap-4 px-3 py-3 rounded-lg border border-red-200 bg-red-50 text-left">
               <div className="flex-1 min-w-0">
                 <h3 className="text-sm font-semibold text-gray-900 mb-1.5">
                   Help center number
                 </h3>
                 <p className="text-xs font-semibold text-red-700">
                   {helpCentrePhone.trim()}
                 </p>
               </div>

               <a
                 href={`tel:${helpCentrePhone.replace(/\D/g, "").slice(-10)}`}
                 className="flex-shrink-0 p-2 bg-white hover:bg-red-100 rounded-full transition-colors border border-red-200"
                 aria-label="Call help center"
               >
                 <PhoneCall className="w-5 h-5 text-red-700" />
               </a>
             </div>
           </div>
         ) : null}
      </div>

      {/* Bottom Navigation */}
      <BottomNavOrders />
    </div>
  )
}

