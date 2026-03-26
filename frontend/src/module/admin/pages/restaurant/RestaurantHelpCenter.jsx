import { useState, useEffect } from "react"
import { adminAPI } from "@/lib/api"
import { Loader2 } from "lucide-react"

export default function RestaurantHelpCenter() {
  const [phoneNumber, setPhoneNumber] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Fetch current phone number from database
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getBusinessSettings()
        const settings = response?.data?.data
        if (settings?.phone?.number) {
          setPhoneNumber(settings.phone.number)
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    const nextValue = phoneNumber.trim()
    setSaving(true)
    setStatusMessage("")

    try {
      // Save to database
      await adminAPI.updateBusinessSettings({
        phoneNumber: nextValue,
        phoneCountryCode: "+91"
      })

      setIsError(false)
      setStatusMessage("Help center number saved")
    } catch (error) {
      console.error("Failed to save help center number:", error)
      setIsError(true)
      setStatusMessage("Failed to save help center number")
    } finally {
      setSaving(false)
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
              disabled={saving || loading}
              className="px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>

          {loading ? (
             <div className="flex justify-center py-8">
               <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
             </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
