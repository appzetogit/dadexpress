import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Save, Clock } from "lucide-react"
import { restaurantAPI } from "@/lib/api"
import Loader from "@/components/Loader"
import { toast } from "sonner"

const DEFAULT_LUNCH_SLOTS = [
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", 
  "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM"
];

const DEFAULT_DINNER_SLOTS = [
  "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM", 
  "9:00 PM", "9:30 PM", "10:00 PM", "10:30 PM"
];

const DISCOUNT_OPTIONS = [
  "No OFF", "5% OFF", "10% OFF", "15% OFF", 
  "20% OFF", "25% OFF", "30% OFF", "40% OFF", "50% OFF"
];

export default function DiningDiscounts() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("Lunch")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  
  const [slots, setSlots] = useState({
    Lunch: [],
    Dinner: []
  })

  useEffect(() => {
    fetchRestaurant()
  }, [])

  const fetchRestaurant = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getCurrentRestaurant()
      if (response?.data?.success && response?.data?.data?.restaurant) {
        const rData = response.data.data.restaurant
        setRestaurantData(rData)
        
        // Load existing slots or initialize with defaults
        const existingSlots = rData.diningSettings?.slots || {}
        
        const initialLunch = existingSlots.Lunch?.length > 0 
          ? existingSlots.Lunch 
          : DEFAULT_LUNCH_SLOTS.map(time => ({ time, discount: "No OFF" }))
          
        const initialDinner = existingSlots.Dinner?.length > 0 
          ? existingSlots.Dinner 
          : DEFAULT_DINNER_SLOTS.map(time => ({ time, discount: "No OFF" }))

        setSlots({
          Lunch: initialLunch,
          Dinner: initialDinner
        })
      }
    } catch (error) {
      console.error("Error fetching restaurant:", error)
      toast.error("Failed to load dining settings")
    } finally {
      setLoading(false)
    }
  }

  const handleDiscountChange = (tab, index, newDiscount) => {
    const updatedSlots = { ...slots }
    updatedSlots[tab][index].discount = newDiscount
    setSlots(updatedSlots)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await restaurantAPI.updateProfile({
        diningSettings: {
          ...restaurantData?.diningSettings,
          slots: slots
        }
      })
      
      if (response?.data?.success) {
        toast.success("Dining discounts saved successfully!")
      } else {
        throw new Error("Failed to update settings")
      }
    } catch (error) {
      console.error("Error saving dining slots:", error)
      toast.error("Failed to save changes. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader />

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Dining Discounts</h1>
            <p className="text-xs text-gray-500">Manage table booking discounts</p>
          </div>
        </div>
        
        {/* Tab Bar */}
        <div className="flex mt-4">
          <button
            onClick={() => setActiveTab("Lunch")}
            className={`flex-1 pb-3 text-sm font-bold relative ${
              activeTab === "Lunch" ? "text-red-600" : "text-gray-500"
            }`}
          >
            Lunch Slots
            {activeTab === "Lunch" && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600"
                initial={false}
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab("Dinner")}
            className={`flex-1 pb-3 text-sm font-bold relative ${
              activeTab === "Dinner" ? "text-red-600" : "text-gray-500"
            }`}
          >
            Dinner Slots
            {activeTab === "Dinner" && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600"
                initial={false}
              />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <h2 className="font-bold text-gray-800">
              {activeTab} Discounts
            </h2>
          </div>
          
          <div className="divide-y divide-gray-100">
            {slots[activeTab].map((slot, index) => (
              <div key={index} className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                <span className="font-semibold text-gray-900 w-24">{slot.time}</span>
                <select
                  value={slot.discount}
                  onChange={(e) => handleDiscountChange(activeTab, index, e.target.value)}
                  className={`bg-white border rounded-lg py-2 px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    slot.discount !== "No OFF" ? "border-red-200 text-red-600 bg-red-50" : "border-gray-200 text-gray-700"
                  }`}
                >
                  {DISCOUNT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-50">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  )
}
