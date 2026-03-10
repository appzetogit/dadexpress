import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ChevronDown } from "lucide-react"
import { useProgressStore } from "../store/progressStore"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"

export default function TimeOnOrders() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedTimeRange, setSelectedTimeRange] = useState("Select Time")
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimeRangePicker, setShowTimeRangePicker] = useState(false)

  const timeRanges = [
    "Select Time",
    "00:00 - 06:00",
    "06:00 - 12:00",
    "12:00 - 18:00",
    "18:00 - 24:00",
    "All Day"
  ]

  // Raw sessions fetched from backend (unfiltered)
  const [rawSessions, setRawSessions] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const { updateTodayTimeOnOrders } = useProgressStore()

  // Fetch sessions from backend trip history API
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setIsLoading(true)

        const response = await deliveryAPI.getTripHistory({
          period: "daily",
          date: selectedDate.toISOString(),
          page: 1,
          limit: 200,
        })

        if (response?.data?.success && response.data?.data?.trips) {
          const trips = response.data.data.trips

          const sessionsFromTrips = trips.map((trip, index) => {
            const createdAt = trip.createdAt ? new Date(trip.createdAt) : null
            const deliveredAt = trip.deliveredAt ? new Date(trip.deliveredAt) : null

            // Calculate duration in minutes using real timestamps when possible
            let durationMinutes = 0
            if (createdAt && deliveredAt && deliveredAt > createdAt) {
              durationMinutes = Math.round((deliveredAt - createdAt) / (1000 * 60))
            }

            // Fallback: estimate 30 minutes per completed trip
            if (!durationMinutes || durationMinutes < 0) {
              durationMinutes = 30
            }

            const startTime = createdAt || new Date()
            const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000)

            const formatTime = (date) => {
              const h = String(date.getHours()).padStart(2, "0")
              const m = String(date.getMinutes()).padStart(2, "0")
              return `${h}:${m}`
            }

            const hours = Math.floor(durationMinutes / 60)
            const minutes = durationMinutes % 60

            return {
              id: trip.id || trip.orderId || index + 1,
              session: trip.orderId ? `Order ${trip.orderId}` : `Session ${index + 1}`,
              timeRange: `${formatTime(startTime)} - ${formatTime(endTime)}`,
              timeOnOrders: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
              hours,
              minutes,
              duration: durationMinutes,
              _startMinutesSinceMidnight: startTime.getHours() * 60 + startTime.getMinutes(),
            }
          })

          setRawSessions(sessionsFromTrips)
        } else {
          // If API doesn't return trips, keep empty sessions (same as previous behaviour)
          setRawSessions([])
        }
      } catch (error) {
        console.error("Error fetching time on orders (trip history):", error)
        // Keep UI behaviour same: just show "No sessions found" and optional toast
        toast.error(error.response?.data?.message || "Failed to fetch time on orders")
        setRawSessions([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // Apply time range filter on top of raw sessions from backend
  const sessions = useMemo(() => {
    if (!rawSessions || rawSessions.length === 0) return []

    if (selectedTimeRange === "Select Time" || selectedTimeRange === "All Day") {
      return [...rawSessions].sort((a, b) => a._startMinutesSinceMidnight - b._startMinutesSinceMidnight)
    }

    const [start, end] = selectedTimeRange.split(" - ").map((t) => {
      const [h, m] = t.split(":").map(Number)
      return h * 60 + m
    })

    return rawSessions
      .filter((session) => {
        const startMinutes = session._startMinutesSinceMidnight
        return startMinutes >= start && startMinutes < end
      })
      .sort((a, b) => a._startMinutesSinceMidnight - b._startMinutesSinceMidnight)
  }, [rawSessions, selectedTimeRange])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowDatePicker(false)
      setShowTimeRangePicker(false)
    }
    if (showDatePicker || showTimeRangePicker) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showDatePicker, showTimeRangePicker])

  // Calculate total hours
  const totalHours = sessions.reduce((sum, session) => sum + session.hours, 0)
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0)
  const finalHours = totalHours + Math.floor(totalMinutes / 60)
  const finalMinutes = totalMinutes % 60

  // Update store when sessions change
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDateNormalized = new Date(selectedDate)
    selectedDateNormalized.setHours(0, 0, 0, 0)
    
    if (selectedDateNormalized.getTime() === today.getTime() && (selectedTimeRange === "Select Time" || selectedTimeRange === "All Day")) {
      const totalHoursValue = finalHours + (finalMinutes / 60)
      updateTodayTimeOnOrders(totalHoursValue)
    }
  }, [sessions, finalHours, finalMinutes, selectedDate, selectedTimeRange, updateTodayTimeOnOrders])

  // Format date for display
  const formatDateDisplay = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else {
      const options = { day: 'numeric', month: 'long' }
      return date.toLocaleDateString('en-US', options)
    }
  }

  // Generate recent dates for picker
  const generateRecentDates = () => {
    const dates = []
    for (let i = 0; i < 30; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      dates.push(date)
    }
    return dates
  }

  const recentDates = generateRecentDates()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center">
        <button
          onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/delivery")}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
        >
          <ArrowLeft className="w-5 h-5 text-black" />
        </button>
        <h1 className="text-lg font-bold text-black flex-1 text-center">Time on orders</h1>
        <div className="w-10"></div>
      </div>

      {/* Date and Time Selection */}
      <div className="px-4 py-4 border-b border-gray-200 flex gap-3">
        {/* Date Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowDatePicker(!showDatePicker)
            setShowTimeRangePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">
            {formatDateDisplay(selectedDate)}
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
        </button>

        {/* Time Range Selector */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowTimeRangePicker(!showTimeRangePicker)
            setShowDatePicker(false)
          }}
          className="flex-1 flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-black">{selectedTimeRange}</span>
          <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${showTimeRangePicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Date Picker Dropdown */}
      {showDatePicker && (
        <div className="fixed left-4 right-4 top-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {recentDates.map((date, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedDate(date)
                setShowDatePicker(false)
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                date.toDateString() === selectedDate.toDateString() ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-sm text-black">{formatDateDisplay(date)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Time Range Picker Dropdown */}
      {showTimeRangePicker && (
        <div className="fixed right-4 top-32 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px]">
          {timeRanges.map((range, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedTimeRange(range)
                setShowTimeRangePicker(false)
              }}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors ${
                range === selectedTimeRange ? 'bg-gray-50 font-medium' : ''
              }`}
            >
              <span className="text-sm text-black">{range}</span>
            </button>
          ))}
        </div>
      )}

      {/* Central Display */}
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-6xl font-bold text-black mb-2">
          {String(finalHours).padStart(2, "0")}:{String(finalMinutes).padStart(2, "0")}
        </p>
        <p className="text-base text-gray-600 mt-2">Hours on orders</p>
        {isLoading && (
          <p className="text-xs text-gray-400 mt-2">
            Loading from your trip history...
          </p>
        )}
      </div>

      {/* Sessions Table */}
      {sessions.length > 0 && (
        <div className="px-4 pb-6">
          {/* Table Headers */}
          <div className="bg-gray-50 border-b-2 border-gray-300 px-4 py-3 flex items-center">
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">Sessions</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">Time Range</p>
            </div>
            <div className="flex-1 text-right">
              <p className="text-sm font-semibold text-black">Time on orders</p>
            </div>
          </div>

          {/* Table Rows */}
          <div className="bg-white">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border-b border-gray-200 px-4 py-4 flex items-center hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-sm text-black">{session.session}</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-black">{session.timeRange}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium text-black">{session.timeOnOrders}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-base">No sessions found for selected time range</p>
        </div>
      )}
    </div>
  )
}


