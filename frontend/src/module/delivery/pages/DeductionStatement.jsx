import { useState, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { 
  ArrowLeft,
  ChevronDown,
  Calendar,
  CheckCircle
} from "lucide-react"
import { formatCurrency } from "../../restaurant/utils/currency"
import WeekSelector from "../components/WeekSelector"
import { fetchWalletTransactions } from "../utils/deliveryWalletState"
import { toast } from "sonner"

export default function TipsStatement() {
  const navigate = useNavigate()
  
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const today = new Date()
    const weekAgo = new Date(today)
    weekAgo.setDate(today.getDate() - 7)
    return weekAgo
  })
  const [endDate, setEndDate] = useState(new Date())
  const [showCalendar, setShowCalendar] = useState(false)
  const calendarRef = useRef(null)
  const [deductions, setDeductions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  
  // Format date range display
  const dateRangeDisplay = useMemo(() => {
    if (!startDate || !endDate) return "Select date range"
    const formatDate = (date) => {
      const day = date.getDate()
      const month = date.toLocaleString('en-US', { month: 'short' })
      return `${day} ${month}`
    }
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  }, [startDate, endDate])
  
  // Handle date range change from calendar
  const handleDateRangeChange = (start, end) => {
    setStartDate(start)
    setEndDate(end)
    // Here you would fetch tips data for the selected date range
    // fetchTipsData(start, end)
  }
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false)
      }
    }
    
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCalendar])
  
  // Fetch deduction data based on selected date range from wallet transactions
  useEffect(() => {
    const fetchDeductions = async () => {
      try {
        if (!startDate || !endDate) {
          setDeductions([])
          return
        }

        setIsLoading(true)

        // Get all wallet transactions (we will filter deductions by type/description)
        const transactions = await fetchWalletTransactions({
          page: 1,
          limit: 200,
        })

        if (!transactions || transactions.length === 0) {
          setDeductions([])
          return
        }

        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)

        const filtered = transactions
          .filter((t) => {
            const type = (t.type || "").toLowerCase()
            const desc = (t.description || "").toLowerCase()

            // Heuristic: treat withdrawals, adjustments, fees, penalties as deductions
            const isDeduction =
              type === "withdrawal" ||
              type === "adjustment" ||
              type === "fee" ||
              desc.includes("deduction") ||
              desc.includes("penalty") ||
              desc.includes("fine") ||
              desc.includes("charge") ||
              desc.includes("settlement")

            if (!isDeduction) return false

            const txDate = t.date ? new Date(t.date) : t.createdAt ? new Date(t.createdAt) : null
            if (!txDate) return false

            return txDate >= start && txDate <= end
          })
          .map((t) => {
            const txDate = t.date ? new Date(t.date) : t.createdAt ? new Date(t.createdAt) : new Date()
            return {
              description: t.description || "Wallet deduction",
              date: txDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }),
              amount: t.amount || 0,
            }
          })

        setDeductions(filtered)
      } catch (error) {
        console.error("Error fetching deduction transactions:", error)
        toast.error(error.response?.data?.message || "Failed to fetch deduction statements")
        setDeductions([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchDeductions()
  }, [startDate, endDate])
  
  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 md:py-6 flex items-center gap-4 rounded-b-3xl md:rounded-b-none">
        <button 
          onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/delivery")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Deduction statement</h1>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6">
        {/* Date Range Selector with Calendar */}
          <WeekSelector />

        {/* Transactions List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin mb-4" />
            <p className="text-gray-600 text-base font-medium">Loading deduction statements...</p>
          </div>
        ) : deductions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            {/* Empty State Illustration */}
            <div className="flex flex-col gap-2 mb-6">
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md border border-gray-200 w-64">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-base font-medium">No transactions</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {deductions.map((item, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-4 shadow-md border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded ${ 
                      index % 3 === 0 ? 'bg-green-500' : 
                      index % 3 === 1 ? 'bg-orange-500' : 'bg-blue-500'
                    }`}></div>
                    <div>
                      <p className="text-gray-900 text-sm font-medium">{item.description}</p>
                      <p className="text-gray-500 text-xs">{item.date}</p>
                    </div>
                  </div>
                  <div className="text-red-600 text-sm font-medium">
                    -{formatCurrency(Math.abs(item.amount))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


