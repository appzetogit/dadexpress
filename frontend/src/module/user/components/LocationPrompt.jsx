import { useEffect, useState } from "react"
import { MapPin } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLocation } from "../hooks/useLocation"
import { hasManualSelectedAddress } from "../utils/deliveryAddress"

const OPEN_LOCATION_SELECTOR_EVENT = "user-open-location-selector"

const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  },
}

export default function LocationPrompt() {
  const { location, loading, permissionGranted, requestLocation } = useLocation()
  const [showPrompt, setShowPrompt] = useState(false)

  const closePrompt = (persistDismissal = true) => {
    setShowPrompt(false)
    document.body.style.overflow = ""

    if (persistDismissal) {
      safeStorage.setItem("locationPromptDismissed", "true")
    }

    try {
      sessionStorage.removeItem("showLocationPromptAfterLogin")
    } catch {
      // Ignore session storage access failures.
    }
  }

  useEffect(() => {
    if (hasManualSelectedAddress()) {
      closePrompt()
      return
    }

    const storedLocation = safeStorage.getItem("userLocation")
    const promptDismissed = safeStorage.getItem("locationPromptDismissed")
    const shouldShowAfterLogin = (() => {
      try {
        return sessionStorage.getItem("showLocationPromptAfterLogin") === "true"
      } catch {
        return false
      }
    })()

    if (shouldShowAfterLogin) {
      const timer = setTimeout(() => {
        if (!permissionGranted && !hasManualSelectedAddress()) {
          setShowPrompt(true)
          document.body.style.overflow = "hidden"
        } else {
          closePrompt(false)
        }
      }, 0)

      return () => {
        clearTimeout(timer)
        document.body.style.overflow = ""
      }
    }

    if (storedLocation) {
      closePrompt(false)
      return
    }

    if (!promptDismissed) {
      const timer = setTimeout(() => {
        const currentLocation = safeStorage.getItem("userLocation")
        if (!currentLocation && !permissionGranted) {
          setShowPrompt(true)
          document.body.style.overflow = "hidden"
        }
      }, 2000)

      return () => {
        clearTimeout(timer)
        document.body.style.overflow = ""
      }
    }
  }, [permissionGranted])

  useEffect(() => {
    if (location && showPrompt) {
      const timer = setTimeout(() => {
        closePrompt()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [location, showPrompt])

  const handleAllow = async () => {
    if (hasManualSelectedAddress()) {
      closePrompt()
      return
    }

    try {
      const nextLocation = await requestLocation()
      if (nextLocation) {
        closePrompt()
      }
    } catch {
      setShowPrompt(true)
      document.body.style.overflow = "hidden"
    }
  }

  const handleManualLocation = () => {
    window.dispatchEvent(new Event(OPEN_LOCATION_SELECTOR_EVENT))
    closePrompt()
  }

  useEffect(() => {
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  if (!showPrompt) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]">
      <Card className="w-full max-w-[350px] rounded-[24px] border border-[#f1e6e7] bg-white p-0 shadow-[0_24px_60px_rgba(62,24,28,0.18)] animate-in fade-in zoom-in-95 duration-200">
        <CardContent className="px-6 py-7 text-center">
          <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f8efef]">
            <MapPin className="h-8 w-8 text-[#b98b8f]" strokeWidth={2.25} />
          </div>
          <h2 className="text-[29px] font-extrabold tracking-[-0.03em] text-[#766c80] sm:text-[31px]">
            Location Access Required
          </h2>
          <p className="mx-auto mt-3 max-w-[260px] text-[16px] leading-6 text-[#938a99]">
            We need your location to show you products available near you and enable
            delivery services. Location access is required to continue.
          </p>
          <div className="mt-6 space-y-3">
            <Button
              onClick={handleAllow}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-[#c78b8f] to-[#b86b71] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(184,107,113,0.28)] hover:opacity-95"
              disabled={loading}
            >
              {loading ? "Getting Location..." : "Allow Location Access"}
            </Button>
            <button
              type="button"
              onClick={handleManualLocation}
              className="w-full bg-transparent text-[15px] font-semibold text-[#8d8496]"
            >
              Enter Location Manually
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
