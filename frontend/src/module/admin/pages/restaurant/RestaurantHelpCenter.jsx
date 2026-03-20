import { useState } from "react"

const HELP_CENTRE_PHONE_KEY = "dadexpress_restaurant_help_centre_phone"

export default function RestaurantHelpCenter() {
  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      return localStorage.getItem(HELP_CENTRE_PHONE_KEY) ?? ""
    } catch {
      return ""
    }
  })
  const [statusMessage, setStatusMessage] = useState("")
  const [isError, setIsError] = useState(false)

  const handleSave = () => {
    const nextValue = phoneNumber.trim()

    try {
      if (nextValue) {
        localStorage.setItem(HELP_CENTRE_PHONE_KEY, nextValue)
      } else {
        localStorage.removeItem(HELP_CENTRE_PHONE_KEY)
      }

      setIsError(false)
      setStatusMessage("Help center number saved")
    } catch (error) {
      console.error("Failed to save help center number:", error)
      setIsError(true)
      setStatusMessage("Failed to save help center number")
    }
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Help Center</h1>
            <button
              onClick={handleSave}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md"
            >
              Save
            </button>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">
            Help center phone number
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Ex: +91 98765 43210"
            className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            This number will be shown on the Restaurant app Help centre page and will be clickable to call.
          </p>
          {statusMessage ? (
            <p className={`mt-3 text-sm ${isError ? "text-red-600" : "text-green-600"}`}>
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
