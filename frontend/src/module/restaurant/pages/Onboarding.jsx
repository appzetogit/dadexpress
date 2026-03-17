import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Image as ImageIcon, Upload, Clock, Calendar as CalendarIcon, Sparkles, X, Camera, MapPin } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { uploadAPI, api, locationAPI } from "@/lib/api"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { determineStepToShow } from "../utils/onboardingUtils"
import { toast } from "sonner"
import { useCompanyName } from "@/lib/hooks/useCompanyName"
import { clearModuleAuth, getModuleToken, setAuthData } from "@/lib/utils/auth"
import { readStoredRestaurantUser } from "@/module/restaurant/utils/restaurantSessionGuard"

const cuisinesOptions = [
  "North Indian",
  "South Indian",
  "Chinese",
  "Pizza",
  "Burgers",
  "Bakery",
  "Cafe",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const ONBOARDING_STORAGE_KEY = "restaurant_onboarding_data"
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const FSSAI_NUMBER_REGEX = /^[0-9]{14}$/
const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/
const PHONE_REGEX = /^[6-9][0-9]{9}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/
const RESTAURANT_NAME_REGEX = /^[A-Za-z][A-Za-z &.'-]*$/
const CITY_REGEX = /^[A-Za-z][A-Za-z .'-]*$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

const getVerifiedPhoneFromStoredRestaurant = () => {
  try {
    const storedUser = localStorage.getItem("restaurant_user")
    if (!storedUser) return ""
    const user = JSON.parse(storedUser)
    const candidates = [
      user?.ownerPhone,
      user?.primaryContactNumber,
      user?.phone,
      user?.phoneNumber,
      user?.mobile,
      user?.contactNumber,
      user?.contact?.phone,
      user?.owner?.phone,
      user?.restaurant?.phone,
    ]
    const phone = candidates.find((value) => typeof value === "string" && value.trim())
    return phone ? phone.trim() : ""
  } catch {
    return ""
  }
}

// Helper functions for localStorage
const saveOnboardingToLocalStorage = (step1, step2, step3, step4, currentStep) => {
  try {
    // Convert File objects to a serializable format (we'll store file names/paths if available)
    const serializableStep2 = {
      ...step2,
      menuImages: step2.menuImages.map((file) => {
        if (file instanceof File) {
          return { name: file.name, size: file.size, type: file.type }
        }
        return file
      }),
      profileImage: step2.profileImage instanceof File
        ? { name: step2.profileImage.name, size: step2.profileImage.size, type: step2.profileImage.type }
        : step2.profileImage,
    }

    const serializableStep3 = {
      ...step3,
      panImage: step3.panImage instanceof File
        ? { name: step3.panImage.name, size: step3.panImage.size, type: step3.panImage.type }
        : step3.panImage,
      gstImage: step3.gstImage instanceof File
        ? { name: step3.gstImage.name, size: step3.gstImage.size, type: step3.gstImage.type }
        : step3.gstImage,
      fssaiImage: step3.fssaiImage instanceof File
        ? { name: step3.fssaiImage.name, size: step3.fssaiImage.size, type: step3.fssaiImage.type }
        : step3.fssaiImage,
    }

    const dataToSave = {
      step1,
      step2: serializableStep2,
      step3: serializableStep3,
      step4: step4 || {},
      currentStep,
      timestamp: Date.now(),
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(dataToSave))
  } catch (error) {
    console.error("Failed to save onboarding data to localStorage:", error)
  }
}

const loadOnboardingFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error("Failed to load onboarding data from localStorage:", error)
  }
  return null
}

const clearOnboardingFromLocalStorage = () => {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear onboarding data from localStorage:", error)
  }
}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return new Date(2000, 0, 1, 10, 0) // Default to 10:00 AM
  }
  const [hours, minutes] = timeString.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 10, minutes || 0)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

const formatDateToLocalYMD = (date) => {
  if (!date || Number.isNaN(date.getTime?.())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalYMDDate = (value) => {
  if (!value || typeof value !== "string") return undefined
  const parts = value.split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function TimeSelector({ label, value, onChange, error }) {
  const timeValue = stringToTime(value)

  const handleTimeChange = (newValue) => {
    if (newValue) {
      const timeString = timeToString(newValue)
      onChange(timeString)
    }
  }

  return (
    <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-gray-800" />
        <span className="text-xs font-medium text-gray-900">{label}</span>
      </div>
      <MobileTimePicker
        value={timeValue}
        onChange={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              "& .MuiOutlinedInput-root": {
                height: "36px",
                fontSize: "12px",
                backgroundColor: "white",
                "& fieldset": {
                  borderColor: "#e5e7eb",
                },
                "&:hover fieldset": {
                  borderColor: "#d1d5db",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#000",
                },
              },
              "& .MuiInputBase-input": {
                padding: "8px 12px",
                fontSize: "12px",
              },
            },
          },
        }}
        format="hh:mm a"
      />
      {error ? (
        <p className="text-[11px] text-red-600 mt-2">{error}</p>
      ) : null}
    </div>
  )
}


export default function RestaurantOnboarding() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState("")
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [isFssaiCalendarOpen, setIsFssaiCalendarOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const initOnceRef = useRef(false)
  const fetchOnceRef = useRef(false)
  const hasCachedOnboardingRef = useRef(false)

  const [step1, setStep1] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      landmark: "",
      latitude: null,
      longitude: null,
    },
  })

  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    openingTime: "",
    closingTime: "",
    openDays: [],
  })
  const [customCuisineInput, setCustomCuisineInput] = useState("")

  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const [step4, setStep4] = useState({
    estimatedDeliveryTime: "",
    featuredDish: "",
    featuredPrice: "",
    offer: "",
    referralCode: "",
  })

  const STEP_FIELD_KEYS = useMemo(() => {
    return {
      1: [
        "step1.restaurantName",
        "step1.ownerName",
        "step1.ownerEmail",
        "step1.ownerPhone",
        "step1.primaryContactNumber",
        "step1.location.area",
        "step1.location.city",
      ],
      2: [
        "step2.menuImages",
        "step2.profileImage",
        "step2.cuisines",
        "step2.openingTime",
        "step2.closingTime",
        "step2.openDays",
      ],
      3: [
        "step3.panNumber",
        "step3.nameOnPan",
        "step3.panImage",
        "step3.gstNumber",
        "step3.gstLegalName",
        "step3.gstAddress",
        "step3.gstImage",
        "step3.fssaiNumber",
        "step3.fssaiExpiry",
        "step3.fssaiImage",
        "step3.accountNumber",
        "step3.confirmAccountNumber",
        "step3.ifscCode",
        "step3.accountHolderName",
        "step3.accountType",
      ],
      4: [
        "step4.estimatedDeliveryTime",
        "step4.featuredDish",
        "step4.featuredPrice",
        "step4.offer",
      ],
    }
  }, [])

  const getFieldError = (key) => (errors && key in errors ? errors[key] : "")

  const clearFieldError = (key) => {
    setErrors((prev) => {
      if (!prev || !(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const setFieldError = (key, message) => {
    setErrors((prev) => {
      const next = { ...(prev || {}) }
      if (!message) {
        delete next[key]
      } else {
        next[key] = message
      }
      return next
    })
  }

  const markTouched = (key) => {
    setTouched((prev) => ({ ...(prev || {}), [key]: true }))
  }

  const normalizeTextValue = (value) => {
    if (value === null || value === undefined) return ""
    return String(value).replace(/\s+/g, " ").trim()
  }

  const normalizeDigits = (value) => {
    if (value === null || value === undefined) return ""
    return String(value).replace(/[^\d]/g, "")
  }

  const normalizePhoneForValidation = (value) => {
    let digits = normalizeDigits(value)
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2)
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1)
    return digits
  }

  const stripDigits = (value) => {
    if (value === null || value === undefined) return ""
    return String(value).replace(/[0-9]/g, "")
  }

  const validateField = (key, value, context) => {
    const ctx = context || { step1, step2, step3, step4 }
    const text = normalizeTextValue(value)

    switch (key) {
      case "step1.restaurantName":
        if (!text) return "Restaurant name is required"
        if (!RESTAURANT_NAME_REGEX.test(text)) return "Restaurant name contains invalid characters"
        return ""
      case "step1.ownerName":
        if (!text) return "Owner name is required"
        if (!NAME_REGEX.test(text)) return "Owner name must not contain numbers or special characters"
        return ""
      case "step1.ownerEmail": {
        const email = normalizeTextValue(value).toLowerCase()
        if (!email) return "Owner email is required"
        if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address"
        return ""
      }
      case "step1.ownerPhone": {
        const digits = normalizePhoneForValidation(value)
        if (!digits) return "Owner phone number is required"
        if (!PHONE_REGEX.test(digits)) return "Phone number must be a valid 10-digit number"
        return ""
      }
      case "step1.primaryContactNumber": {
        const digits = normalizePhoneForValidation(value)
        if (!digits) return "Primary contact number is required"
        if (!PHONE_REGEX.test(digits)) return "Primary contact number must be a valid 10-digit number"
        return ""
      }
      case "step1.location.area":
        return text ? "" : "Area/Sector/Locality is required"
      case "step1.location.city":
        if (!text) return "City is required"
        if (!CITY_REGEX.test(text)) return "City contains invalid characters"
        return ""

      case "step2.menuImages": {
        const list = Array.isArray(value) ? value : ctx.step2?.menuImages
        const hasMenuImages = Array.isArray(list) && list.length > 0
        if (!hasMenuImages) return "At least one menu image is required"
        const validMenuImages = list.filter((img) => {
          if (img instanceof File) return true
          if (img?.url && typeof img.url === "string") return true
          if (typeof img === "string" && img.startsWith("http")) return true
          return false
        })
        return validMenuImages.length > 0 ? "" : "Please upload at least one valid menu image"
      }
      case "step2.profileImage": {
        const img = value ?? ctx.step2?.profileImage
        if (!img) return "Restaurant profile image is required"
        const isValid =
          img instanceof File ||
          (img?.url && typeof img.url === "string") ||
          (typeof img === "string" && img.startsWith("http"))
        return isValid ? "" : "Please upload a valid restaurant profile image"
      }
      case "step2.cuisines": {
        const cuisines = Array.isArray(value) ? value : ctx.step2?.cuisines
        return cuisines && cuisines.length > 0 ? "" : "Please select at least one cuisine"
      }
      case "step2.openingTime":
        return normalizeTextValue(value) ? "" : "Opening time is required"
      case "step2.closingTime":
        return normalizeTextValue(value) ? "" : "Closing time is required"
      case "step2.openDays": {
        const days = Array.isArray(value) ? value : ctx.step2?.openDays
        return days && days.length > 0 ? "" : "Please select at least one open day"
      }

      case "step3.panNumber": {
        const pan = normalizeTextValue(value).toUpperCase()
        if (!pan) return "PAN number is required"
        if (!PAN_NUMBER_REGEX.test(pan)) return "PAN number must be valid (e.g., ABCDE1234F)"
        return ""
      }
      case "step3.nameOnPan":
        if (!text) return "Name on PAN is required"
        if (!NAME_REGEX.test(text)) return "Name on PAN must not contain numbers or special characters"
        return ""
      case "step3.panImage": {
        const img = value ?? ctx.step3?.panImage
        if (!img) return "PAN image is required"
        const isValid =
          img instanceof File ||
          (img?.url && typeof img.url === "string") ||
          (typeof img === "string" && img.startsWith("http"))
        return isValid ? "" : "Please upload a valid PAN image"
      }
      case "step3.fssaiNumber": {
        const digits = normalizeDigits(value)
        if (!digits) return "FSSAI number is required"
        if (!FSSAI_NUMBER_REGEX.test(digits)) return "FSSAI number must be exactly 14 digits"
        return ""
      }
      case "step3.fssaiExpiry":
        return normalizeTextValue(value) ? "" : "FSSAI expiry date is required"
      case "step3.fssaiImage": {
        const img = value ?? ctx.step3?.fssaiImage
        if (!img) return "FSSAI image is required"
        const isValid =
          img instanceof File ||
          (img?.url && typeof img.url === "string") ||
          (typeof img === "string" && img.startsWith("http"))
        return isValid ? "" : "Please upload a valid FSSAI image"
      }

      case "step3.gstNumber": {
        if (!ctx.step3?.gstRegistered) return ""
        return normalizeTextValue(value) ? "" : "GST number is required when GST registered"
      }
      case "step3.gstLegalName": {
        if (!ctx.step3?.gstRegistered) return ""
        return normalizeTextValue(value) ? "" : "GST legal name is required when GST registered"
      }
      case "step3.gstAddress": {
        if (!ctx.step3?.gstRegistered) return ""
        return normalizeTextValue(value) ? "" : "GST registered address is required when GST registered"
      }
      case "step3.gstImage": {
        if (!ctx.step3?.gstRegistered) return ""
        const img = value ?? ctx.step3?.gstImage
        if (!img) return "GST image is required when GST registered"
        const isValid =
          img instanceof File ||
          (img?.url && typeof img.url === "string") ||
          (typeof img === "string" && img.startsWith("http"))
        return isValid ? "" : "Please upload a valid GST image"
      }

      case "step3.accountNumber": {
        const digits = normalizeDigits(value)
        if (!digits) return "Account number is required"
        if (!ACCOUNT_NUMBER_REGEX.test(digits)) return "Account number must be 9 to 18 digits"
        return ""
      }
      case "step3.confirmAccountNumber": {
        const confirmDigits = normalizeDigits(value)
        if (!confirmDigits) return "Please confirm your account number"
        const baseDigits = normalizeDigits(ctx.step3?.accountNumber)
        if (baseDigits && confirmDigits && baseDigits !== confirmDigits) {
          return "Account number and confirmation do not match"
        }
        if (!ACCOUNT_NUMBER_REGEX.test(confirmDigits)) return "Account number must be 9 to 18 digits"
        return ""
      }
      case "step3.ifscCode": {
        const ifsc = normalizeTextValue(value).toUpperCase().replace(/\s+/g, "")
        if (!ifsc) return "IFSC code is required"
        if (!IFSC_REGEX.test(ifsc)) return "IFSC code must be valid (e.g., HDFC0001234)"
        return ""
      }
      case "step3.accountHolderName":
        if (!text) return "Account holder name is required"
        if (!NAME_REGEX.test(text)) return "Account holder name must not contain numbers or special characters"
        return ""
      case "step3.accountType":
        return normalizeTextValue(value) ? "" : "Account type is required"

      case "step4.estimatedDeliveryTime":
        return normalizeTextValue(value) ? "" : "Estimated delivery time is required"
      case "step4.featuredDish":
        return normalizeTextValue(value) ? "" : "Featured dish name is required"
      case "step4.featuredPrice": {
        const raw = normalizeTextValue(value)
        const price = raw ? Number.parseFloat(raw) : NaN
        if (!raw) return "Featured dish price is required"
        if (Number.isNaN(price) || price <= 0) return "Featured dish price must be greater than 0"
        return ""
      }
      case "step4.offer":
        return normalizeTextValue(value) ? "" : "Special offer/promotion is required"

      default:
        return ""
    }
  }

  const validateStepFields = (stepNumber) => {
    const keys = STEP_FIELD_KEYS[stepNumber] || []
    const next = {}
    const ctx = { step1, step2, step3, step4 }

    for (const key of keys) {
      let value
      if (key.startsWith("step1.")) {
        if (key === "step1.location.area") value = step1.location?.area
        else if (key === "step1.location.city") value = step1.location?.city
        else value = step1[key.split(".")[1]]
      } else if (key.startsWith("step2.")) {
        value = step2[key.split(".")[1]]
      } else if (key.startsWith("step3.")) {
        value = step3[key.split(".")[1]]
      } else if (key.startsWith("step4.")) {
        value = step4[key.split(".")[1]]
      }

      const message = validateField(key, value, ctx)
      if (message) next[key] = message
    }

    // Extra conditional requirements: only validate GST fields when enabled
    if (stepNumber === 3 && !step3.gstRegistered) {
      delete next["step3.gstNumber"]
      delete next["step3.gstLegalName"]
      delete next["step3.gstAddress"]
      delete next["step3.gstImage"]
    }

    return next
  }

  const replaceErrorsForStep = (stepNumber, stepErrors) => {
    const keys = STEP_FIELD_KEYS[stepNumber] || []
    setErrors((prev) => {
      const next = { ...(prev || {}) }
      for (const k of keys) delete next[k]
      for (const [k, v] of Object.entries(stepErrors || {})) {
        if (v) next[k] = v
      }
      return next
    })
  }

  const parseCameraResult = (rawResult) => {
    let result = rawResult

    if (Array.isArray(result)) {
      result = result[0]
    }
    if (typeof result === "string") {
      try {
        result = JSON.parse(result)
      } catch {
        return null
      }
    }

    if (!result || !result.success || !result.base64) {
      return null
    }

    return result
  }

  const convertBase64ToFile = (cameraResult, fallbackName) => {
    const base64Content = cameraResult.base64.includes(",")
      ? cameraResult.base64.split(",").pop()
      : cameraResult.base64

    const byteString = atob(base64Content)
    const uint8Array = new Uint8Array(byteString.length)
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i)
    }

    const mimeType = cameraResult.mimeType || "image/jpeg"
    const fileName = cameraResult.fileName || fallbackName
    return new File([uint8Array], fileName, { type: mimeType })
  }

  const captureImageFromLiveCamera = async (onSuccess, fallbackName) => {
    try {
      if (!window.flutter_inappwebview?.callHandler) {
        toast.error("Live camera is only available in the app")
        return
      }

      const rawResult = await window.flutter_inappwebview.callHandler("openCamera")
      const cameraResult = parseCameraResult(rawResult)
      if (!cameraResult) {
        toast.error("No photo captured from camera")
        return
      }

      const file = convertBase64ToFile(cameraResult, fallbackName)
      onSuccess(file)
      toast.success("Photo captured successfully")
    } catch (error) {
      console.error("Camera capture error:", error)
      toast.error("Failed to capture photo from camera")
    }
  }

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser")
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords
          const response = await locationAPI.reverseGeocode(latitude, longitude)
          
          if (response?.data?.success) {
            const data = response.data.data
            const results = data.results || []
            if (results.length > 0) {
              const result = results[0]
              const addressComponents = result.address_components || {}
              
              let extractedArea = ""
              let extractedCity = ""
              
              if (Array.isArray(addressComponents)) {
                const sublocality = addressComponents.find(c => 
                  c.types?.includes('sublocality') || 
                  c.types?.includes('sublocality_level_1') || 
                  c.types?.includes('neighborhood')
                )
                extractedArea = sublocality?.long_name || ""
                
                const cityComp = addressComponents.find(c => c.types?.includes('locality'))
                extractedCity = cityComp?.long_name || ""
              } else {
                extractedArea = addressComponents.area || ""
                extractedCity = addressComponents.city || ""
              }

              setStep1(prev => ({
                ...prev,
                location: {
                  ...prev.location,
                  area: extractedArea || prev.location.area,
                  city: normalizeTextValue(stripDigits(extractedCity)) || prev.location.city,
                  latitude,
                  longitude
                }
              }))
              toast.success("Location updated successfully")
            }
          } else {
            setStep1(prev => ({
              ...prev,
              location: {
                ...prev.location,
                latitude,
                longitude
              }
            }))
            toast.success("Location coordinates updated")
          }
        } catch (err) {
          console.error("Error getting location address:", err)
          toast.error("Failed to get address. Coordinates saved.")
          setStep1(prev => ({
            ...prev,
            location: {
              ...prev.location,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }
          }))
        } finally {
          setLocating(false)
        }
      },
      (error) => {
        setLocating(false)
        console.error("Geolocation error:", error)
        toast.error("Failed to get your current location")
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const getImageLabel = (imageValue, fallbackLabel) => {
    if (!imageValue) return null
    if (imageValue instanceof File) return imageValue.name
    if (imageValue?.name) return imageValue.name
    if (typeof imageValue === "string") {
      if (imageValue.startsWith("http")) {
        const parts = imageValue.split("/")
        return parts[parts.length - 1] || fallbackLabel
      }
      return imageValue
    }
    return fallbackLabel
  }

  const normalizeCuisineValue = (value) => {
    if (value === null || value === undefined) return ""
    return String(value).trim().replace(/\s+/g, " ")
  }

  const cuisineKey = (value) => normalizeCuisineValue(value).toLowerCase()

  const dedupeCuisines = (values) => {
    const list = Array.isArray(values) ? values : []
    const seen = new Set()
    const out = []

    for (const item of list) {
      const normalized = normalizeCuisineValue(item)
      if (!normalized) continue
      const key = cuisineKey(normalized)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(normalized)
    }

    return out
  }


  // Load from localStorage on mount and check URL parameter
  useEffect(() => {
    if (initOnceRef.current) {
      // Preserve existing query parameter handling: allow `?step=` to control the visible step.
      const stepParam = searchParams.get("step")
      if (stepParam) {
        const stepNum = parseInt(stepParam, 10)
        if (stepNum >= 1 && stepNum <= 4) {
          setStep(stepNum)
        }
      }
      return
    }

    initOnceRef.current = true
    setVerifiedPhoneNumber(getVerifiedPhoneFromStoredRestaurant())

    // Check if step is specified in URL (from OTP login redirect)
    const stepParam = searchParams.get("step")
    if (stepParam) {
      const stepNum = parseInt(stepParam, 10)
      if (stepNum >= 1 && stepNum <= 4) {
        setStep(stepNum)
      }
    }

    const localData = loadOnboardingFromLocalStorage()
    if (localData) {
      hasCachedOnboardingRef.current = true
      if (localData.step1) {
        setStep1({
          restaurantName: localData.step1.restaurantName || "",
          ownerName: localData.step1.ownerName || "",
          ownerEmail: localData.step1.ownerEmail || "",
          ownerPhone: localData.step1.ownerPhone || "",
          primaryContactNumber: localData.step1.primaryContactNumber || "",
          location: {
            addressLine1: localData.step1.location?.addressLine1 || "",
            addressLine2: localData.step1.location?.addressLine2 || "",
            area: localData.step1.location?.area || "",
            city: localData.step1.location?.city || "",
            landmark: localData.step1.location?.landmark || "",
            latitude: localData.step1.location?.latitude || null,
            longitude: localData.step1.location?.longitude || null,
          },
        })
      }
      if (localData.step2) {
        setStep2({
          menuImages: localData.step2.menuImages || [],
          profileImage: localData.step2.profileImage || null,
          cuisines: dedupeCuisines(localData.step2.cuisines || []),
          openingTime: localData.step2.openingTime || "",
          closingTime: localData.step2.closingTime || "",
          openDays: localData.step2.openDays || [],
        })
      }
      if (localData.step3) {
        setStep3({
          panNumber: localData.step3.panNumber || "",
          nameOnPan: localData.step3.nameOnPan || "",
          panImage: localData.step3.panImage || null,
          gstRegistered: localData.step3.gstRegistered || false,
          gstNumber: localData.step3.gstNumber || "",
          gstLegalName: localData.step3.gstLegalName || "",
          gstAddress: localData.step3.gstAddress || "",
          gstImage: localData.step3.gstImage || null,
          fssaiNumber: localData.step3.fssaiNumber || "",
          fssaiExpiry: localData.step3.fssaiExpiry || "",
          fssaiImage: localData.step3.fssaiImage || null,
          accountNumber: localData.step3.accountNumber || "",
          confirmAccountNumber: localData.step3.confirmAccountNumber || "",
          ifscCode: localData.step3.ifscCode || "",
          accountHolderName: localData.step3.accountHolderName || "",
          accountType: localData.step3.accountType || "",
        })
      }
      if (localData.step4) {
        setStep4({
          estimatedDeliveryTime: localData.step4.estimatedDeliveryTime || "",
          featuredDish: localData.step4.featuredDish || "",
          featuredPrice: localData.step4.featuredPrice || "",
          offer: localData.step4.offer || "",
          referralCode: localData.step4.referralCode || "",
        })
      }
      // Only set step from localStorage if URL doesn't have a step parameter
      if (localData.currentStep && !stepParam) {
        setStep(localData.currentStep)
      }

      // Avoid a visible UI blink: render cached onboarding immediately.
      setLoading(false)
    }
  }, [searchParams])

  useEffect(() => {
    if (!verifiedPhoneNumber) return
    setStep1((prev) => ({
      ...prev,
      ownerPhone: verifiedPhoneNumber,
      primaryContactNumber: verifiedPhoneNumber,
    }))
  }, [verifiedPhoneNumber])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateInset = () => {
      const vv = window.visualViewport
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height))
      setKeyboardInset(inset > 120 ? inset : 0)
    }

    updateInset()
    window.visualViewport.addEventListener("resize", updateInset)
    window.visualViewport.addEventListener("scroll", updateInset)
    return () => {
      window.visualViewport.removeEventListener("resize", updateInset)
      window.visualViewport.removeEventListener("scroll", updateInset)
    }
  }, [])

  // Save to localStorage whenever step data changes
  useEffect(() => {
    saveOnboardingToLocalStorage(step1, step2, step3, step4, step)
  }, [step1, step2, step3, step4, step])

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (fetchOnceRef.current) return
        fetchOnceRef.current = true

        // Only show the blocking loader when no cached onboarding is available.
        if (!hasCachedOnboardingRef.current) {
          setLoading(true)
        }
        const res = await api.get("/restaurant/onboarding")
        const data = res?.data?.data?.onboarding
        if (data) {
          if (data.step1) {
            setStep1((prev) => ({
              restaurantName: data.step1.restaurantName || "",
              ownerName: data.step1.ownerName || "",
              ownerEmail: data.step1.ownerEmail || "",
              ownerPhone: data.step1.ownerPhone || "",
              primaryContactNumber: data.step1.primaryContactNumber || "",
              location: {
                addressLine1: data.step1.location?.addressLine1 || "",
                addressLine2: data.step1.location?.addressLine2 || "",
                area: data.step1.location?.area || "",
                city: data.step1.location?.city || "",
                landmark: data.step1.location?.landmark || "",
                latitude: data.step1.location?.latitude || null,
                longitude: data.step1.location?.longitude || null,
              },
            }))
          }
          if (data.step2) {
            setStep2({
              // Load menu images from URLs if available
              menuImages: data.step2.menuImageUrls || [],
              // Load profile image URL if available
              profileImage: data.step2.profileImageUrl || null,
              cuisines: dedupeCuisines(data.step2.cuisines || []),
              openingTime: data.step2.deliveryTimings?.openingTime || "",
              closingTime: data.step2.deliveryTimings?.closingTime || "",
              openDays: data.step2.openDays || [],
            })
          }
          if (data.step3) {
            setStep3({
              panNumber: data.step3.pan?.panNumber || "",
              nameOnPan: data.step3.pan?.nameOnPan || "",
              panImage: null, // Don't load images from API, user needs to re-upload
              gstRegistered: data.step3.gst?.isRegistered || false,
              gstNumber: data.step3.gst?.gstNumber || "",
              gstLegalName: data.step3.gst?.legalName || "",
              gstAddress: data.step3.gst?.address || "",
              gstImage: null, // Don't load images from API, user needs to re-upload
              fssaiNumber: data.step3.fssai?.registrationNumber || "",
              fssaiExpiry: data.step3.fssai?.expiryDate
                ? data.step3.fssai.expiryDate.slice(0, 10)
                : "",
              fssaiImage: null, // Don't load images from API, user needs to re-upload
              accountNumber: data.step3.bank?.accountNumber || "",
              confirmAccountNumber: data.step3.bank?.accountNumber || "",
              ifscCode: data.step3.bank?.ifscCode || "",
              accountHolderName: data.step3.bank?.accountHolderName || "",
              accountType: data.step3.bank?.accountType || "",
            })
          }

          if (data.step4) {
            setStep4({
              estimatedDeliveryTime: data.step4.estimatedDeliveryTime || "",
              featuredDish: data.step4.featuredDish || "",
              featuredPrice: data.step4.featuredPrice || "",
              offer: data.step4.offer || "",
              referralCode: data.step4.referralCode || "",
            })
          }

          // Determine which step to show based on completeness
          const stepToShow = determineStepToShow(data)
          if (stepToShow === null) {
            // Safety: if auth/session says onboarding is incomplete, never bounce to /restaurant
            // based on onboarding payload alone (prevents redirect loops/blinking).
            const storedRestaurant = readStoredRestaurantUser()
            if (storedRestaurant?.isProfileCompleted === false) {
              const fallbackStep = Number(data?.currentStep || data?.step || 1)
              setStep(
                Number.isFinite(fallbackStep) && fallbackStep >= 1 && fallbackStep <= 4
                  ? fallbackStep
                  : 1,
              )
              return
            }

            navigate("/restaurant", { replace: true })
            return
          } else {
            setStep(stepToShow)
          }
        }
      } catch (err) {
        // Handle error gracefully - if it's a 401 (unauthorized), the user might need to login again
        // Otherwise, just continue with empty onboarding data
        if (err?.response?.status === 401) {
          console.error("Authentication error fetching onboarding:", err)
          // Don't show error to user, they can still fill the form
          // The error might be because restaurant is not yet active (pending verification)
        } else {
          console.error("Error fetching onboarding data:", err)
        }
      } finally {
        if (!hasCachedOnboardingRef.current) {
          setLoading(false)
        }
      }
    }
    fetchData()
  }, [navigate])

  // Persist active step to DB so onboarding can resume reliably after exit/reload
  useEffect(() => {
    if (!step || step < 1 || step > 4) return
    if (loading) return

    const timer = setTimeout(() => {
      api.put("/restaurant/onboarding", { currentStep: step }).catch(() => {
        // Non-blocking best effort sync
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [step, loading])

  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      // Provide more informative error message for upload failures
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      console.error("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  // Validation functions for each step
  const validateStep1 = () => {
    return validateStepFields(1)
  }

  const validateStep2 = () => {
    return validateStepFields(2)
  }

  const validateStep4 = () => {
    return validateStepFields(4)
  }

  const validateStep3 = () => {
    return validateStepFields(3)
  }

  // Fill dummy data for testing (development mode only)
  const fillDummyData = () => {
    if (step === 1) {
      setStep1({
        restaurantName: "Test Restaurant",
        ownerName: "John Doe",
        ownerEmail: "john.doe@example.com",
        ownerPhone: "+91 9876543210",
        primaryContactNumber: "+91 9876543210",
        location: {
          addressLine1: "123 Main Street",
          addressLine2: "Building A, Floor 2",
          area: "Downtown",
          city: "Mumbai",
          landmark: "Near Central Park",
        },
      })
      toast.success("Step 1 filled with dummy data", { duration: 2000 })
    } else if (step === 2) {
      setStep2({
        menuImages: [],
        profileImage: null,
        cuisines: ["North Indian", "Chinese"],
        openingTime: "09:00",
        closingTime: "22:00",
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      })
      toast.success("Step 2 filled with dummy data", { duration: 2000 })
    } else if (step === 3) {
      // Calculate expiry date 1 year from now
      const expiryDate = new Date()
      expiryDate.setFullYear(expiryDate.getFullYear() + 1)
      const expiryDateString = formatDateToLocalYMD(expiryDate)

      setStep3({
        panNumber: "ABCDE1234F",
        nameOnPan: "John Doe",
        panImage: null,
        gstRegistered: true,
        gstNumber: "27ABCDE1234F1Z5",
        gstLegalName: "Test Restaurant Private Limited",
        gstAddress: "123 Main Street, Mumbai, Maharashtra 400001",
        gstImage: null,
        fssaiNumber: "12345678901234",
        fssaiExpiry: expiryDateString,
        fssaiImage: null,
        accountNumber: "1234567890123",
        confirmAccountNumber: "1234567890123",
        ifscCode: "HDFC0001234",
        accountHolderName: "John Doe",
        accountType: "savings",
      })
      toast.success("Step 3 filled with dummy data", { duration: 2000 })
    } else if (step === 4) {
      setStep4({
        estimatedDeliveryTime: "25-30 mins",
        featuredDish: "Butter Chicken Special",
        featuredPrice: "249",
        offer: "Flat ₹50 OFF above ₹199",
        referralCode: "DUMMY123",
      })
      toast.success("Step 4 filled with dummy data", { duration: 2000 })
    }
  }

  const handleNext = async () => {
    setError("")

    // Validate current step before proceeding
    let stepErrors = {}
    if (step === 1) {
      stepErrors = validateStep1()
    } else if (step === 2) {
      stepErrors = validateStep2()
    } else if (step === 3) {
      stepErrors = validateStep3()
    } else if (step === 4) {
      stepErrors = validateStep4()
      console.log('🔍 Step 4 validation:', {
        step4,
        errors: stepErrors,
        estimatedDeliveryTime: step4.estimatedDeliveryTime,
        featuredDish: step4.featuredDish,
        featuredPrice: step4.featuredPrice,
        offer: step4.offer
      })
    }

    replaceErrorsForStep(step, stepErrors)
    if (STEP_FIELD_KEYS[step]?.length) {
      setTouched((prev) => {
        const next = { ...(prev || {}) }
        for (const key of STEP_FIELD_KEYS[step]) next[key] = true
        return next
      })
    }

    const validationErrors = Object.values(stepErrors || {}).filter(Boolean)
    if (validationErrors.length > 0) {
      // Show error toast for each validation error
      validationErrors.forEach((error, index) => {
        setTimeout(() => {
          toast.error(error, {
            duration: 4000,
          })
        }, index * 100)
      })
      console.log('❌ Validation failed:', validationErrors)
      return
    }

    setSaving(true)
    try {
      if (step === 1) {
        const cleanedStep1 = {
          ...step1,
          restaurantName: normalizeTextValue(step1.restaurantName),
          ownerName: normalizeTextValue(step1.ownerName),
          ownerEmail: normalizeTextValue(step1.ownerEmail).toLowerCase(),
          ownerPhone: normalizePhoneForValidation(step1.ownerPhone),
          primaryContactNumber: normalizePhoneForValidation(step1.primaryContactNumber),
          location: {
            ...step1.location,
            addressLine1: normalizeTextValue(step1.location?.addressLine1),
            addressLine2: normalizeTextValue(step1.location?.addressLine2),
            area: normalizeTextValue(step1.location?.area),
            city: normalizeTextValue(step1.location?.city),
            landmark: normalizeTextValue(step1.location?.landmark),
          },
        }
        const payload = {
          step1: cleanedStep1,
          completedSteps: 1,
          currentStep: 2,
        }
        await api.put("/restaurant/onboarding", payload)
        setStep(2)
      } else if (step === 2) {
        const menuUploads = []
        // Upload menu images if they are File objects
        for (const file of step2.menuImages.filter((f) => f instanceof File)) {
          try {
            const uploaded = await handleUpload(file, "appzeto/restaurant/menu")
            // Verify upload was successful and has valid URL
            if (!uploaded || !uploaded.url) {
              throw new Error(`Failed to upload menu image: ${file.name}`)
            }
            menuUploads.push(uploaded)
          } catch (uploadError) {
            console.error('Menu image upload error:', uploadError)
            throw new Error(`Failed to upload menu image: ${uploadError.message}`)
          }
        }
        // If menuImages already have URLs (from previous save), include them
        const existingMenuUrls = step2.menuImages.filter((img) => !(img instanceof File) && (img?.url || (typeof img === 'string' && img.startsWith('http'))))
        const allMenuUrls = [...existingMenuUrls, ...menuUploads]

        // Verify we have at least one menu image
        if (allMenuUrls.length === 0) {
          throw new Error('At least one menu image must be uploaded')
        }

        // Upload profile image if it's a File object
        let profileUpload = null
        if (step2.profileImage instanceof File) {
          try {
            profileUpload = await handleUpload(step2.profileImage, "appzeto/restaurant/profile")
            // Verify upload was successful and has valid URL
            if (!profileUpload || !profileUpload.url) {
              throw new Error('Failed to upload profile image')
            }
          } catch (uploadError) {
            console.error('Profile image upload error:', uploadError)
            throw new Error(`Failed to upload profile image: ${uploadError.message}`)
          }
        } else if (step2.profileImage?.url) {
          // If profileImage already has a URL (from previous save), use it
          profileUpload = step2.profileImage
        } else if (typeof step2.profileImage === 'string' && step2.profileImage.startsWith('http')) {
          // If it's a direct URL string
          profileUpload = { url: step2.profileImage }
        }

        // Verify profile image is present
        if (!profileUpload || !profileUpload.url) {
          throw new Error('Profile image must be uploaded')
        }

        const payload = {
          step2: {
            menuImageUrls: allMenuUrls.length > 0 ? allMenuUrls : [],
            profileImageUrl: profileUpload,
            cuisines: dedupeCuisines(step2.cuisines || []),
            deliveryTimings: {
              openingTime: normalizeTextValue(step2.openingTime),
              closingTime: normalizeTextValue(step2.closingTime),
            },
            openDays: step2.openDays || [],
          },
          completedSteps: 2,
          currentStep: 3,
        }
        console.log('📤 Step2 payload:', {
          menuImageUrlsCount: payload.step2.menuImageUrls.length,
          hasProfileImage: !!payload.step2.profileImageUrl,
          cuisines: payload.step2.cuisines,
          openDays: payload.step2.openDays,
          deliveryTimings: payload.step2.deliveryTimings,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('✅ Step2 response:', response?.data)

        // Verify request is successful (some APIs return 204 with empty body)
        if (
          !response ||
          (typeof response.status === "number" && (response.status < 200 || response.status >= 300))
        ) {
          throw new Error("Failed to save Step 2")
        }

        // After step2, also update restaurant schema with step2 data
        // This ensures data is saved immediately, not just in onboarding subdocument
        if (response?.data?.data?.restaurant) {
          console.log('✅ Step2 data saved and restaurant updated')
        }

        // Only proceed to step 3 if save was successful
        if (response?.data?.data?.onboarding || response?.data?.data) {
          console.log('✅ Step2 completed successfully, moving to step 3')
          setStep(3)
        } else {
          throw new Error('Failed to save step2 data')
        }
      } else if (step === 3) {
        // Upload PAN image if it's a File object
        let panImageUpload = null
        if (step3.panImage instanceof File) {
          try {
            panImageUpload = await handleUpload(step3.panImage, "appzeto/restaurant/pan")
            // Verify upload was successful and has valid URL
            if (!panImageUpload || !panImageUpload.url) {
              throw new Error('Failed to upload PAN image')
            }
          } catch (uploadError) {
            console.error('PAN image upload error:', uploadError)
            throw new Error(`Failed to upload PAN image: ${uploadError.message}`)
          }
        } else if (step3.panImage?.url) {
          // If panImage already has a URL (from previous save), use it
          panImageUpload = step3.panImage
        } else if (typeof step3.panImage === 'string' && step3.panImage.startsWith('http')) {
          // If it's a direct URL string
          panImageUpload = { url: step3.panImage }
        }

        // Verify PAN image is present
        if (!panImageUpload || !panImageUpload.url) {
          throw new Error('PAN image must be uploaded')
        }

        // Upload GST image if it's a File object (only if GST registered)
        let gstImageUpload = null
        if (step3.gstRegistered) {
          if (step3.gstImage instanceof File) {
            try {
              gstImageUpload = await handleUpload(step3.gstImage, "appzeto/restaurant/gst")
              // Verify upload was successful and has valid URL
              if (!gstImageUpload || !gstImageUpload.url) {
                throw new Error('Failed to upload GST image')
              }
            } catch (uploadError) {
              console.error('GST image upload error:', uploadError)
              throw new Error(`Failed to upload GST image: ${uploadError.message}`)
            }
          } else if (step3.gstImage?.url) {
            // If gstImage already has a URL (from previous save), use it
            gstImageUpload = step3.gstImage
          } else if (typeof step3.gstImage === 'string' && step3.gstImage.startsWith('http')) {
            // If it's a direct URL string
            gstImageUpload = { url: step3.gstImage }
          }

          // Verify GST image is present if GST registered
          if (!gstImageUpload || !gstImageUpload.url) {
            throw new Error('GST image must be uploaded when GST registered')
          }
        }

        // Upload FSSAI image if it's a File object
        let fssaiImageUpload = null
        if (step3.fssaiImage instanceof File) {
          try {
            fssaiImageUpload = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai")
            // Verify upload was successful and has valid URL
            if (!fssaiImageUpload || !fssaiImageUpload.url) {
              throw new Error('Failed to upload FSSAI image')
            }
          } catch (uploadError) {
            console.error('FSSAI image upload error:', uploadError)
            throw new Error(`Failed to upload FSSAI image: ${uploadError.message}`)
          }
        } else if (step3.fssaiImage?.url) {
          // If fssaiImage already has a URL (from previous save), use it
          fssaiImageUpload = step3.fssaiImage
        } else if (typeof step3.fssaiImage === 'string' && step3.fssaiImage.startsWith('http')) {
          // If it's a direct URL string
          fssaiImageUpload = { url: step3.fssaiImage }
        }

        // Verify FSSAI image is present
        if (!fssaiImageUpload || !fssaiImageUpload.url) {
          throw new Error('FSSAI image must be uploaded')
        }

        const payload = {
          step3: {
            pan: {
              panNumber: normalizeTextValue(step3.panNumber).toUpperCase(),
              nameOnPan: normalizeTextValue(step3.nameOnPan),
              image: panImageUpload,
            },
            gst: {
              isRegistered: step3.gstRegistered || false,
              gstNumber: normalizeTextValue(step3.gstNumber),
              legalName: normalizeTextValue(step3.gstLegalName),
              address: normalizeTextValue(step3.gstAddress),
              image: gstImageUpload,
            },
            fssai: {
              registrationNumber: normalizeDigits(step3.fssaiNumber),
              expiryDate: normalizeTextValue(step3.fssaiExpiry) || null,
              image: fssaiImageUpload,
            },
            bank: {
              accountNumber: normalizeDigits(step3.accountNumber),
              ifscCode: normalizeTextValue(step3.ifscCode).toUpperCase().replace(/\s+/g, ""),
              accountHolderName: normalizeTextValue(step3.accountHolderName),
              accountType: normalizeTextValue(step3.accountType),
            },
          },
          completedSteps: 3,
          currentStep: 4,
        }
        console.log('📤 Step3 payload:', {
          hasPan: !!payload.step3.pan.panNumber,
          hasGst: payload.step3.gst.isRegistered,
          hasFssai: !!payload.step3.fssai.registrationNumber,
          hasBank: !!payload.step3.bank.accountNumber,
        })

        const response = await api.put("/restaurant/onboarding", payload)
        console.log('✅ Step3 response:', response?.data)

        if (response?.data?.data?.onboarding) {
          console.log('✅ Step3 data saved successfully')
        }
        setStep(4)
      } else if (step === 4) {
        console.log('📤 Submitting Step 4:', step4)
        const payload = {
          step4: {
            estimatedDeliveryTime: normalizeTextValue(step4.estimatedDeliveryTime),
            featuredDish: normalizeTextValue(step4.featuredDish),
            featuredPrice: parseFloat(normalizeTextValue(step4.featuredPrice)) || 249,
            offer: normalizeTextValue(step4.offer),
            referralCode: normalizeTextValue(step4.referralCode).toUpperCase(),
          },
          completedSteps: 4,
          currentStep: 4,
        }
        console.log('📤 Step 4 payload:', payload)
        const response = await api.put("/restaurant/onboarding", payload)
        console.log('✅ Step4 completed, response:', response?.data)

        // Verify request is successful (some APIs return 204 with empty body)
        if (
          !response ||
          (typeof response.status === "number" && (response.status < 200 || response.status >= 300))
        ) {
          throw new Error("Failed to complete onboarding")
        }

        // Ensure restaurant session reflects completion, otherwise ProtectedRoute will keep redirecting to onboarding.
        try {
          const token = getModuleToken("restaurant")
          const stored = readStoredRestaurantUser()
          const fromApi =
            response?.data?.data?.restaurant ||
            response?.data?.data?.user ||
            response?.data?.data ||
            response?.data?.restaurant ||
            response?.data?.user ||
            null

          const baseUser = fromApi && typeof fromApi === "object" ? fromApi : stored
          if (token && baseUser) {
            const nextUser = {
              ...baseUser,
              onboarding: {
                ...(baseUser.onboarding || {}),
                currentStep: 4,
                completedSteps: 4,
              },
              isProfileCompleted: true,
            }
            setAuthData("restaurant", token, nextUser)
            try {
              window.dispatchEvent(new Event("restaurantAuthChanged"))
            } catch {
              // ignore
            }
          }
        } catch {
          // Non-blocking: navigation still happens and session will self-heal on refresh.
        }

        // Clear localStorage when onboarding is complete
        clearOnboardingFromLocalStorage()

        // Show success message briefly, then navigate
        console.log('✅ Onboarding completed successfully, redirecting to restaurant home...')

        // Wait a moment to ensure data is saved, then navigate
        setTimeout(() => {
          // Navigate to restaurant home page after onboarding completion
          console.log('🚀 Navigating to restaurant home page...')
          navigate("/restaurant", { replace: true })
        }, 800)
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to save onboarding data"
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const toggleCuisine = (cuisine) => {
    const nextCuisine = normalizeCuisineValue(cuisine)
    if (!nextCuisine) return

    setStep2((prev) => {
      const current = dedupeCuisines(prev.cuisines)
      const nextKey = cuisineKey(nextCuisine)
      const exists = current.some((item) => cuisineKey(item) === nextKey)

      const nextCuisines = exists
        ? current.filter((item) => cuisineKey(item) !== nextKey)
        : [...current, nextCuisine]

      const nextState = { ...prev, cuisines: nextCuisines }
      markTouched("step2.cuisines")
      setFieldError("step2.cuisines", validateField("step2.cuisines", nextCuisines, { step1, step2: nextState, step3, step4 }))
      return nextState
    })
  }

  const addCustomCuisine = () => {
    const nextCuisine = normalizeCuisineValue(customCuisineInput)
    if (!nextCuisine) return

    setCustomCuisineInput("")
    setStep2((prev) => {
      const current = dedupeCuisines(prev.cuisines)
      const nextKey = cuisineKey(nextCuisine)
      if (current.some((item) => cuisineKey(item) === nextKey)) {
        return prev
      }
      const nextCuisines = [...current, nextCuisine]
      const nextState = { ...prev, cuisines: nextCuisines }
      markTouched("step2.cuisines")
      setFieldError("step2.cuisines", validateField("step2.cuisines", nextCuisines, { step1, step2: nextState, step3, step4 }))
      return nextState
    })
  }

  const availableCuisines = useMemo(() => {
    return dedupeCuisines([...(cuisinesOptions || []), ...(step2.cuisines || [])])
  }, [step2.cuisines])

  const selectedCuisineKeys = useMemo(() => {
    return new Set(dedupeCuisines(step2.cuisines).map((c) => cuisineKey(c)))
  }, [step2.cuisines])

  const toggleDay = (day) => {
    setStep2((prev) => {
      const exists = prev.openDays.includes(day)
      const nextDays = exists ? prev.openDays.filter((d) => d !== day) : [...prev.openDays, day]
      const nextState = { ...prev, openDays: nextDays }
      markTouched("step2.openDays")
      setFieldError("step2.openDays", validateField("step2.openDays", nextDays, { step1, step2: nextState, step3, step4 }))
      return nextState
    })
  }

  const handleCloseOnboarding = async () => {
    try {
      await api.put("/restaurant/onboarding", { currentStep: step })
    } catch {
      // best effort only
    } finally {
      clearModuleAuth("restaurant")
      localStorage.removeItem("restaurant_user")
      navigate("/restaurant/login", { replace: true })
    }
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
        <p className="text-sm text-gray-600 mb-4">Restaurant name</p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-700">Restaurant name*</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => {
                const v = stripDigits(e.target.value)
                setStep1({ ...step1, restaurantName: v })
                if (touched["step1.restaurantName"]) {
                  setFieldError("step1.restaurantName", validateField("step1.restaurantName", v))
                } else {
                  clearFieldError("step1.restaurantName")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(stripDigits(e.target.value))
                if (v !== e.target.value) {
                  setStep1({ ...step1, restaurantName: v })
                }
                markTouched("step1.restaurantName")
                setFieldError("step1.restaurantName", validateField("step1.restaurantName", v))
              }}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step1.restaurantName") ? "border-red-500" : ""}`}
              placeholder="Customers will see this name"
            />
            {getFieldError("step1.restaurantName") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.restaurantName")}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md">
        <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
        <p className="text-sm text-gray-600 mb-4">
          These details will be used for all business communications and updates.
        </p>
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-700">Full name*</Label>
            <Input
              value={step1.ownerName || ""}
              onChange={(e) => {
                const v = stripDigits(e.target.value)
                setStep1({ ...step1, ownerName: v })
                if (touched["step1.ownerName"]) {
                  setFieldError("step1.ownerName", validateField("step1.ownerName", v))
                } else {
                  clearFieldError("step1.ownerName")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(stripDigits(e.target.value))
                if (v !== e.target.value) {
                  setStep1({ ...step1, ownerName: v })
                }
                markTouched("step1.ownerName")
                setFieldError("step1.ownerName", validateField("step1.ownerName", v))
              }}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step1.ownerName") ? "border-red-500" : ""}`}
              placeholder="Owner full name"
            />
            {getFieldError("step1.ownerName") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.ownerName")}</p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Email address*</Label>
            <Input
              type="email"
              value={step1.ownerEmail || ""}
              onChange={(e) => {
                const v = e.target.value
                setStep1({ ...step1, ownerEmail: v })
                if (touched["step1.ownerEmail"]) {
                  setFieldError("step1.ownerEmail", validateField("step1.ownerEmail", v))
                } else {
                  clearFieldError("step1.ownerEmail")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value).toLowerCase()
                if (v !== e.target.value) {
                  setStep1({ ...step1, ownerEmail: v })
                }
                markTouched("step1.ownerEmail")
                setFieldError("step1.ownerEmail", validateField("step1.ownerEmail", v))
              }}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step1.ownerEmail") ? "border-red-500" : ""}`}
              placeholder="owner@example.com"
            />
            {getFieldError("step1.ownerEmail") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.ownerEmail")}</p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Phone number*</Label>
            <Input
              value={step1.ownerPhone || ""}
              onChange={(e) => {
                const v = e.target.value
                setStep1({ ...step1, ownerPhone: v })
                if (touched["step1.ownerPhone"]) {
                  setFieldError("step1.ownerPhone", validateField("step1.ownerPhone", v))
                } else {
                  clearFieldError("step1.ownerPhone")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                if (v !== e.target.value) {
                  setStep1({ ...step1, ownerPhone: v })
                }
                markTouched("step1.ownerPhone")
                setFieldError("step1.ownerPhone", validateField("step1.ownerPhone", v))
              }}
              readOnly={Boolean(verifiedPhoneNumber)}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step1.ownerPhone") ? "border-red-500" : ""}`}
              placeholder="+91 98XXXXXX"
            />
            {getFieldError("step1.ownerPhone") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.ownerPhone")}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
        <div>
          <Label className="text-xs text-gray-700">Primary contact number*</Label>
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => {
              const v = e.target.value
              setStep1({ ...step1, primaryContactNumber: v })
              if (touched["step1.primaryContactNumber"]) {
                setFieldError("step1.primaryContactNumber", validateField("step1.primaryContactNumber", v))
              } else {
                clearFieldError("step1.primaryContactNumber")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              if (v !== e.target.value) {
                setStep1({ ...step1, primaryContactNumber: v })
              }
              markTouched("step1.primaryContactNumber")
              setFieldError("step1.primaryContactNumber", validateField("step1.primaryContactNumber", v))
            }}
            className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step1.primaryContactNumber") ? "border-red-500" : ""}`}
            placeholder="Restaurant's primary contact number"
          />
          {getFieldError("step1.primaryContactNumber") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.primaryContactNumber")}</p>
          ) : null}
          <p className="text-[11px] text-gray-500 mt-1">
            Customers, delivery partners and {companyName} may call on this number for order
            support.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Add your restaurant's location for order pick-up.
          </p>
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={locating}
            className="flex items-center gap-1.5 text-xs font-medium text-black hover:opacity-80 transition-opacity border border-gray-200 px-3 py-1.5 rounded-sm bg-gray-50/50"
          >
            <MapPin className="w-3.5 h-3.5" />
            {locating ? "Fetching location..." : "Use current location"}
          </button>
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine1: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Shop no. / building no. (optional)"
          />
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, addressLine2: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) =>
              setStep1({
                ...step1,
                location: { ...step1.location, landmark: e.target.value },
              })
            }
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
          <Input
            value={step1.location?.area || ""}
            onChange={(e) => {
              const v = e.target.value
              setStep1({
                ...step1,
                location: { ...step1.location, area: v },
              })
              if (touched["step1.location.area"]) {
                setFieldError("step1.location.area", validateField("step1.location.area", v))
              } else {
                clearFieldError("step1.location.area")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              if (v !== e.target.value) {
                setStep1({
                  ...step1,
                  location: { ...step1.location, area: v },
                })
              }
              markTouched("step1.location.area")
              setFieldError("step1.location.area", validateField("step1.location.area", v))
            }}
            className={`bg-white text-sm ${getFieldError("step1.location.area") ? "border-red-500" : ""}`}
            placeholder="Area / Sector / Locality*"
          />
          {getFieldError("step1.location.area") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.location.area")}</p>
          ) : null}
          <Input
            value={step1.location?.city || ""}
            onChange={(e) => {
              const v = stripDigits(e.target.value)
              setStep1({
                ...step1,
                location: { ...step1.location, city: v },
              })
              if (touched["step1.location.city"]) {
                setFieldError("step1.location.city", validateField("step1.location.city", v))
              } else {
                clearFieldError("step1.location.city")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(stripDigits(e.target.value))
              if (v !== e.target.value) {
                setStep1({
                  ...step1,
                  location: { ...step1.location, city: v },
                })
              }
              markTouched("step1.location.city")
              setFieldError("step1.location.city", validateField("step1.location.city", v))
            }}
            className={`bg-white text-sm ${getFieldError("step1.location.city") ? "border-red-500" : ""}`}
            placeholder="City"
          />
          {getFieldError("step1.location.city") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step1.location.city")}</p>
          ) : null}
          <p className="text-[11px] text-gray-500 mt-1">
            Please ensure that this address is the same as mentioned on your FSSAI license.
          </p>
        </div>
      </section>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Images section */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        <h2 className="text-lg font-semibold text-black">Menu & photos</h2>
        <p className="text-xs text-gray-500">
          Add clear photos of your printed menu and a primary profile image. This helps customers
          understand what you serve.
        </p>

        {/* Menu images */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3 flex items-center justify-between flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-white flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-700" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload menu images</span>
                <span className="text-[11px] text-gray-500">
                  JPG, PNG, WebP • You can select multiple files
                </span>
              </div>
            </div>
            <label
              htmlFor="menuImagesInput"
              className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black  border-black text-xs font-medium cursor-pointer     w-full items-center"
            >
              <Upload className="w-4.5 h-4.5" />
              <span>Choose files</span>
            </label>
            <button
              type="button"
              onClick={() =>
                captureImageFromLiveCamera(
                  (file) =>
                    setStep2((prev) => {
                      const nextMenuImages = [...(prev.menuImages || []), file]
                      const nextState = { ...prev, menuImages: nextMenuImages }
                      markTouched("step2.menuImages")
                      setFieldError(
                        "step2.menuImages",
                        validateField("step2.menuImages", nextMenuImages, { step1, step2: nextState, step3, step4 }),
                      )
                      return nextState
                    }),
                  `menu-image-${Date.now()}.jpg`,
                )
              }
              className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gray-300 bg-white text-gray-900 text-xs font-medium w-full"
            >
              <Camera className="w-4 h-4" />
              <span>Live Camera</span>
            </button>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (!files.length) return
                console.log('📸 Menu images selected:', files.length, 'files')
                setStep2((prev) => {
                  const nextMenuImages = [...(prev.menuImages || []), ...files] // Append new files to existing ones
                  const nextState = { ...prev, menuImages: nextMenuImages }
                  markTouched("step2.menuImages")
                  setFieldError(
                    "step2.menuImages",
                    validateField("step2.menuImages", nextMenuImages, { step1, step2: nextState, step3, step4 }),
                  )
                  return nextState
                })
                // Reset input to allow selecting same file again
                e.target.value = ''
              }}
            />
          </div>
          {getFieldError("step2.menuImages") ? (
            <p className="text-[11px] text-red-600 mt-2">{getFieldError("step2.menuImages")}</p>
          ) : null}

          {/* Menu image previews */}
          {!!step2.menuImages.length && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                // Handle both File objects and URL objects
                let imageUrl = null
                let imageName = `Image ${idx + 1}`

                if (file instanceof File) {
                  imageUrl = URL.createObjectURL(file)
                  imageName = file.name
                } else if (file?.url) {
                  // If it's an object with url property (from backend)
                  imageUrl = file.url
                  imageName = file.name || `Image ${idx + 1}`
                } else if (typeof file === 'string') {
                  // If it's a direct URL string
                  imageUrl = file
                }

                return (
                  <div
                    key={idx}
                    className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100"
                  >
                    <div className="absolute top-1 right-1 z-30">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStep2((prev) => {
                            const nextMenuImages = prev.menuImages.filter((_, i) => i !== idx)
                            const nextState = { ...prev, menuImages: nextMenuImages }
                            markTouched("step2.menuImages")
                            setFieldError(
                              "step2.menuImages",
                              validateField("step2.menuImages", nextMenuImages, { step1, step2: nextState, step3, step4 }),
                            )
                            return nextState
                          });
                        }}
                        className="bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={`Menu ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center">
                        Preview unavailable
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">
                        {imageName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Profile image */}
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Restaurant profile image</Label>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                {step2.profileImage ? (
                  (() => {
                    let imageSrc = null;

                    if (step2.profileImage instanceof File) {
                      imageSrc = URL.createObjectURL(step2.profileImage);
                    } else if (step2.profileImage?.url) {
                      // If it's an object with url property (from backend)
                      imageSrc = step2.profileImage.url;
                    } else if (typeof step2.profileImage === 'string') {
                      // If it's a direct URL string
                      imageSrc = step2.profileImage;
                    }

                    return imageSrc ? (
                      <img
                        src={imageSrc}
                        alt="Restaurant profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-gray-500" />
                    );
                  })()
                ) : (
                  <ImageIcon className="w-6 h-6 text-gray-500" />
                )}
              </div>
              {step2.profileImage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep2((prev) => {
                      const nextState = { ...prev, profileImage: null }
                      markTouched("step2.profileImage")
                      setFieldError(
                        "step2.profileImage",
                        validateField("step2.profileImage", null, { step1, step2: nextState, step3, step4 }),
                      )
                      return nextState
                    });
                  }}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors z-10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 flex-col flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-gray-900">Upload profile image</span>
                <span className="text-[11px] text-gray-500">
                  This will be shown on your listing card and restaurant page.
                </span>
              </div>
            </div>
          </div>
          <label
            htmlFor="profileImageInput"
            className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black  border-black text-xs font-medium cursor-pointer     w-full items-center"
          >
            <Upload className="w-4.5 h-4.5" />
            <span>Upload</span>
          </label>
          <input
            id="profileImageInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                console.log('📸 Profile image selected:', file.name)
                setStep2((prev) => {
                  const nextState = { ...prev, profileImage: file }
                  markTouched("step2.profileImage")
                  setFieldError(
                    "step2.profileImage",
                    validateField("step2.profileImage", file, { step1, step2: nextState, step3, step4 }),
                  )
                  return nextState
                })
              }
              // Reset input to allow selecting same file again
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() =>
              captureImageFromLiveCamera(
                (file) =>
                  setStep2((prev) => {
                    const nextState = { ...prev, profileImage: file }
                    markTouched("step2.profileImage")
                    setFieldError(
                      "step2.profileImage",
                      validateField("step2.profileImage", file, { step1, step2: nextState, step3, step4 }),
                    )
                    return nextState
                  }),
                `restaurant-profile-${Date.now()}.jpg`,
              )
            }
            className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gray-300 bg-white text-gray-900 text-xs font-medium w-full"
          >
            <Camera className="w-4 h-4" />
            <span>Live Camera</span>
          </button>
          {getFieldError("step2.profileImage") ? (
            <p className="text-[11px] text-red-600 mt-2">{getFieldError("step2.profileImage")}</p>
          ) : null}
        </div>
      </section>

      {/* Operational details */}
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
        {/* Cuisines */}
        <div>
          <Label className="text-xs text-gray-700">Select cuisines</Label>
          <p className="text-[11px] text-gray-500 mt-1">
            Select as many as you need. You can also add custom cuisines.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              value={customCuisineInput}
              onChange={(e) => setCustomCuisineInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addCustomCuisine()
                }
              }}
              className="bg-white text-sm"
              placeholder="Add a cuisine (e.g., Thai)"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addCustomCuisine}
              disabled={!normalizeCuisineValue(customCuisineInput)}
              className="text-xs"
            >
              Add
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableCuisines.map((cuisine) => {
              const active = selectedCuisineKeys.has(cuisineKey(cuisine))
              return (
                <button
                  key={cuisineKey(cuisine)}
                  type="button"
                  onClick={() => toggleCuisine(cuisine)}
                  className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
          {getFieldError("step2.cuisines") ? (
            <p className="text-[11px] text-red-600 mt-2">{getFieldError("step2.cuisines")}</p>
          ) : null}
        </div>

        {/* Timings with popover time selectors */}
        <div className="space-y-3">
          <Label className="text-xs text-gray-700">Delivery timings</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimeSelector
              label="Opening time"
              value={step2.openingTime || ""}
              onChange={(val) => {
                const v = val || ""
                const nextState = { ...step2, openingTime: v }
                setStep2(nextState)
                markTouched("step2.openingTime")
                setFieldError("step2.openingTime", validateField("step2.openingTime", v, { step1, step2: nextState, step3, step4 }))
              }}
              error={getFieldError("step2.openingTime")}
            />
            <TimeSelector
              label="Closing time"
              value={step2.closingTime || ""}
              onChange={(val) => {
                const v = val || ""
                const nextState = { ...step2, closingTime: v }
                setStep2(nextState)
                markTouched("step2.closingTime")
                setFieldError("step2.closingTime", validateField("step2.closingTime", v, { step1, step2: nextState, step3, step4 }))
              }}
              error={getFieldError("step2.closingTime")}
            />
          </div>
        </div>

        {/* Open days in a calendar-like grid */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-700 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-800" />
            <span>Open days</span>
          </Label>
          <p className="text-[11px] text-gray-500">
            Select the days your restaurant accepts delivery orders.
          </p>
          <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
            {daysOfWeek.map((day) => {
              const active = step2.openDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"
                    }`}
                >
                  {day.charAt(0)}
                </button>
              )
            })}
          </div>
          {getFieldError("step2.openDays") ? (
            <p className="text-[11px] text-red-600 mt-2">{getFieldError("step2.openDays")}</p>
          ) : null}
        </div>
      </section>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">PAN details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => {
                const normalized = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 10)
                const nextState = { ...step3, panNumber: normalized }
                setStep3(nextState)
                if (touched["step3.panNumber"]) {
                  setFieldError("step3.panNumber", validateField("step3.panNumber", normalized, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.panNumber")
                }
              }}
              onBlur={() => {
                markTouched("step3.panNumber")
                setFieldError("step3.panNumber", validateField("step3.panNumber", step3.panNumber, { step1, step2, step3, step4 }))
              }}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step3.panNumber") ? "border-red-500" : ""}`}
              placeholder="ABCDE1234F"
            />
            {getFieldError("step3.panNumber") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.panNumber")}</p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Name on PAN</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, nameOnPan: v }
                setStep3(nextState)
                if (touched["step3.nameOnPan"]) {
                  setFieldError("step3.nameOnPan", validateField("step3.nameOnPan", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.nameOnPan")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                if (v !== e.target.value) {
                  const nextState = { ...step3, nameOnPan: v }
                  setStep3(nextState)
                  markTouched("step3.nameOnPan")
                  setFieldError("step3.nameOnPan", validateField("step3.nameOnPan", v, { step1, step2, step3: nextState, step4 }))
                  return
                }
                markTouched("step3.nameOnPan")
                setFieldError("step3.nameOnPan", validateField("step3.nameOnPan", v, { step1, step2, step3, step4 }))
              }}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${getFieldError("step3.nameOnPan") ? "border-red-500" : ""}`}
            />
            {getFieldError("step3.nameOnPan") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.nameOnPan")}</p>
            ) : null}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image</Label>
          <label
            htmlFor="panImageInput"
            className="mt-1 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer w-full"
          >
            <Upload className="w-4 h-4" />
            <span>Choose file</span>
          </label>
          <input
            id="panImageInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              const nextState = { ...step3, panImage: file }
              setStep3(nextState)
              markTouched("step3.panImage")
              setFieldError("step3.panImage", validateField("step3.panImage", file, { step1, step2, step3: nextState, step4 }))
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() =>
              captureImageFromLiveCamera(
                (file) =>
                  setStep3((prev) => {
                    const nextState = { ...prev, panImage: file }
                    markTouched("step3.panImage")
                    setFieldError("step3.panImage", validateField("step3.panImage", file, { step1, step2, step3: nextState, step4 }))
                    return nextState
                  }),
                `pan-image-${Date.now()}.jpg`,
              )
            }
            className="mt-2 inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gray-300 bg-white text-gray-900 text-xs font-medium w-full"
          >
            <Camera className="w-4 h-4" />
            <span>Live Camera</span>
          </button>
          {step3.panImage && (
            <p className="mt-2 text-[11px] text-gray-500 truncate">
              Selected: {getImageLabel(step3.panImage, "pan-image.jpg")}
            </p>
          )}
          {getFieldError("step3.panImage") ? (
            <p className="text-[11px] text-red-600 mt-2">{getFieldError("step3.panImage")}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">GST details</h2>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => {
              const nextState = { ...step3, gstRegistered: true }
              setStep3(nextState)
              markTouched("step3.gstNumber")
              markTouched("step3.gstLegalName")
              markTouched("step3.gstAddress")
              markTouched("step3.gstImage")
              setFieldError("step3.gstNumber", validateField("step3.gstNumber", nextState.gstNumber, { step1, step2, step3: nextState, step4 }))
              setFieldError("step3.gstLegalName", validateField("step3.gstLegalName", nextState.gstLegalName, { step1, step2, step3: nextState, step4 }))
              setFieldError("step3.gstAddress", validateField("step3.gstAddress", nextState.gstAddress, { step1, step2, step3: nextState, step4 }))
              setFieldError("step3.gstImage", validateField("step3.gstImage", nextState.gstImage, { step1, step2, step3: nextState, step4 }))
            }}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
              }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => {
              const nextState = { ...step3, gstRegistered: false }
              setStep3(nextState)
              clearFieldError("step3.gstNumber")
              clearFieldError("step3.gstLegalName")
              clearFieldError("step3.gstAddress")
              clearFieldError("step3.gstImage")
            }}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"
              }`}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <Input
              value={step3.gstNumber || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, gstNumber: v }
                setStep3(nextState)
                if (touched["step3.gstNumber"]) {
                  setFieldError("step3.gstNumber", validateField("step3.gstNumber", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.gstNumber")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                const nextState = { ...step3, gstNumber: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.gstNumber")
                setFieldError("step3.gstNumber", validateField("step3.gstNumber", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.gstNumber") ? "border-red-500" : ""}`}
              placeholder="GST number"
            />
            {getFieldError("step3.gstNumber") ? (
              <p className="text-[11px] text-red-600">{getFieldError("step3.gstNumber")}</p>
            ) : null}
            <Input
              value={step3.gstLegalName || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, gstLegalName: v }
                setStep3(nextState)
                if (touched["step3.gstLegalName"]) {
                  setFieldError("step3.gstLegalName", validateField("step3.gstLegalName", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.gstLegalName")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                const nextState = { ...step3, gstLegalName: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.gstLegalName")
                setFieldError("step3.gstLegalName", validateField("step3.gstLegalName", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.gstLegalName") ? "border-red-500" : ""}`}
              placeholder="Legal name"
            />
            {getFieldError("step3.gstLegalName") ? (
              <p className="text-[11px] text-red-600">{getFieldError("step3.gstLegalName")}</p>
            ) : null}
            <Input
              value={step3.gstAddress || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, gstAddress: v }
                setStep3(nextState)
                if (touched["step3.gstAddress"]) {
                  setFieldError("step3.gstAddress", validateField("step3.gstAddress", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.gstAddress")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                const nextState = { ...step3, gstAddress: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.gstAddress")
                setFieldError("step3.gstAddress", validateField("step3.gstAddress", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.gstAddress") ? "border-red-500" : ""}`}
              placeholder="Registered address"
            />
            {getFieldError("step3.gstAddress") ? (
              <p className="text-[11px] text-red-600">{getFieldError("step3.gstAddress")}</p>
            ) : null}
            <div className="space-y-2">
              <label
                htmlFor="gstImageInput"
                className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer w-full"
              >
                <Upload className="w-4 h-4" />
                <span>Choose file</span>
              </label>
                <input
                  id="gstImageInput"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    const nextState = { ...step3, gstImage: file }
                    setStep3(nextState)
                    markTouched("step3.gstImage")
                    setFieldError("step3.gstImage", validateField("step3.gstImage", file, { step1, step2, step3: nextState, step4 }))
                    e.target.value = ""
                  }}
                />
              <button
                type="button"
                onClick={() =>
                    captureImageFromLiveCamera(
                      (file) =>
                        setStep3((prev) => {
                          const nextState = { ...prev, gstImage: file }
                          markTouched("step3.gstImage")
                          setFieldError("step3.gstImage", validateField("step3.gstImage", file, { step1, step2, step3: nextState, step4 }))
                          return nextState
                        }),
                      `gst-image-${Date.now()}.jpg`,
                    )
                  }
                className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gray-300 bg-white text-gray-900 text-xs font-medium w-full"
              >
                <Camera className="w-4 h-4" />
                <span>Live Camera</span>
              </button>
                {step3.gstImage && (
                  <p className="text-[11px] text-gray-500 truncate">
                    Selected: {getImageLabel(step3.gstImage, "gst-image.jpg")}
                  </p>
                )}
                {getFieldError("step3.gstImage") ? (
                  <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.gstImage")}</p>
                ) : null}
              </div>
            </div>
          )}
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input
              value={step3.fssaiNumber || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, fssaiNumber: v }
                setStep3(nextState)
                if (touched["step3.fssaiNumber"]) {
                  setFieldError("step3.fssaiNumber", validateField("step3.fssaiNumber", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.fssaiNumber")
                }
              }}
              onBlur={(e) => {
                const v = normalizeDigits(e.target.value)
                const nextState = { ...step3, fssaiNumber: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.fssaiNumber")
                setFieldError("step3.fssaiNumber", validateField("step3.fssaiNumber", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.fssaiNumber") ? "border-red-500" : ""}`}
              placeholder="FSSAI number"
            />
            {getFieldError("step3.fssaiNumber") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.fssaiNumber")}</p>
            ) : null}
          </div>
          <div>
            <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date</Label>
            <Popover open={isFssaiCalendarOpen} onOpenChange={setIsFssaiCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsFssaiCalendarOpen(true)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-white text-sm text-left flex items-center justify-between hover:bg-gray-50"
                >
                  <span className={step3.fssaiExpiry ? "text-gray-900" : "text-gray-500"}>
                    {step3.fssaiExpiry
                      ? parseLocalYMDDate(step3.fssaiExpiry)?.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                      : "Select expiry date"}
                  </span>
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[100]" align="start">
                <div className="bg-white rounded-md shadow-lg border border-gray-200">
                  <Calendar
                    mode="single"
                    selected={parseLocalYMDDate(step3.fssaiExpiry)}
                     onSelect={(date) => {
                       if (date) {
                         const formattedDate = formatDateToLocalYMD(date)
                        const nextState = { ...step3, fssaiExpiry: formattedDate }
                        setStep3(nextState)
                        markTouched("step3.fssaiExpiry")
                        setFieldError("step3.fssaiExpiry", validateField("step3.fssaiExpiry", formattedDate, { step1, step2, step3: nextState, step4 }))
                         setIsFssaiCalendarOpen(false)
                       }
                     }}
                    initialFocus
                    classNames={{
                      today: "bg-transparent text-foreground border-none", // Remove today highlight
                    }}
                  />
                </div>
              </PopoverContent>
            </Popover>
            {getFieldError("step3.fssaiExpiry") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.fssaiExpiry")}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <label
            htmlFor="fssaiImageInput"
            className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer w-full"
          >
            <Upload className="w-4 h-4" />
            <span>Choose file</span>
          </label>
          <input
            id="fssaiImageInput"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              const nextState = { ...step3, fssaiImage: file }
              setStep3(nextState)
              markTouched("step3.fssaiImage")
              setFieldError("step3.fssaiImage", validateField("step3.fssaiImage", file, { step1, step2, step3: nextState, step4 }))
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() =>
              captureImageFromLiveCamera(
                (file) =>
                  setStep3((prev) => {
                    const nextState = { ...prev, fssaiImage: file }
                    markTouched("step3.fssaiImage")
                    setFieldError("step3.fssaiImage", validateField("step3.fssaiImage", file, { step1, step2, step3: nextState, step4 }))
                    return nextState
                  }),
                `fssai-image-${Date.now()}.jpg`,
              )
            }
            className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gray-300 bg-white text-gray-900 text-xs font-medium w-full"
          >
            <Camera className="w-4 h-4" />
            <span>Live Camera</span>
          </button>
          {step3.fssaiImage && (
            <p className="text-[11px] text-gray-500 truncate">
              Selected: {getImageLabel(step3.fssaiImage, "fssai-image.jpg")}
            </p>
          )}
          {getFieldError("step3.fssaiImage") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.fssaiImage")}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Bank account details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input
              value={step3.accountNumber || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, accountNumber: v }
                setStep3(nextState)
                if (touched["step3.accountNumber"]) {
                  setFieldError("step3.accountNumber", validateField("step3.accountNumber", v, { step1, step2, step3: nextState, step4 }))
                  if (touched["step3.confirmAccountNumber"]) {
                    setFieldError(
                      "step3.confirmAccountNumber",
                      validateField("step3.confirmAccountNumber", nextState.confirmAccountNumber, { step1, step2, step3: nextState, step4 }),
                    )
                  }
                } else {
                  clearFieldError("step3.accountNumber")
                }
              }}
              onBlur={(e) => {
                const v = normalizeDigits(e.target.value)
                const nextState = { ...step3, accountNumber: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.accountNumber")
                setFieldError("step3.accountNumber", validateField("step3.accountNumber", v, { step1, step2, step3: nextState, step4 }))
                if (touched["step3.confirmAccountNumber"]) {
                  setFieldError(
                    "step3.confirmAccountNumber",
                    validateField("step3.confirmAccountNumber", nextState.confirmAccountNumber, { step1, step2, step3: nextState, step4 }),
                  )
                }
              }}
              className={`bg-white text-sm ${getFieldError("step3.accountNumber") ? "border-red-500" : ""}`}
              placeholder="Account number"
            />
            {getFieldError("step3.accountNumber") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.accountNumber")}</p>
            ) : null}
          </div>
          <div>
            <Input
              value={step3.confirmAccountNumber || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, confirmAccountNumber: v }
                setStep3(nextState)
                if (touched["step3.confirmAccountNumber"]) {
                  setFieldError(
                    "step3.confirmAccountNumber",
                    validateField("step3.confirmAccountNumber", v, { step1, step2, step3: nextState, step4 }),
                  )
                } else {
                  clearFieldError("step3.confirmAccountNumber")
                }
              }}
              onBlur={(e) => {
                const v = normalizeDigits(e.target.value)
                const nextState = { ...step3, confirmAccountNumber: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.confirmAccountNumber")
                setFieldError(
                  "step3.confirmAccountNumber",
                  validateField("step3.confirmAccountNumber", v, { step1, step2, step3: nextState, step4 }),
                )
              }}
              className={`bg-white text-sm ${getFieldError("step3.confirmAccountNumber") ? "border-red-500" : ""}`}
              placeholder="Re-enter account number"
            />
            {getFieldError("step3.confirmAccountNumber") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.confirmAccountNumber")}</p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input
              value={step3.ifscCode || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, ifscCode: v }
                setStep3(nextState)
                if (touched["step3.ifscCode"]) {
                  setFieldError("step3.ifscCode", validateField("step3.ifscCode", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.ifscCode")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value).toUpperCase().replace(/\s+/g, "")
                const nextState = { ...step3, ifscCode: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.ifscCode")
                setFieldError("step3.ifscCode", validateField("step3.ifscCode", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.ifscCode") ? "border-red-500" : ""}`}
              placeholder="IFSC code"
            />
            {getFieldError("step3.ifscCode") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.ifscCode")}</p>
            ) : null}
          </div>
          <div>
            <Input
              value={step3.accountType || ""}
              onChange={(e) => {
                const v = e.target.value
                const nextState = { ...step3, accountType: v }
                setStep3(nextState)
                if (touched["step3.accountType"]) {
                  setFieldError("step3.accountType", validateField("step3.accountType", v, { step1, step2, step3: nextState, step4 }))
                } else {
                  clearFieldError("step3.accountType")
                }
              }}
              onBlur={(e) => {
                const v = normalizeTextValue(e.target.value)
                const nextState = { ...step3, accountType: v }
                if (v !== e.target.value) setStep3(nextState)
                markTouched("step3.accountType")
                setFieldError("step3.accountType", validateField("step3.accountType", v, { step1, step2, step3: nextState, step4 }))
              }}
              className={`bg-white text-sm ${getFieldError("step3.accountType") ? "border-red-500" : ""}`}
              placeholder="Account type (savings / current)"
            />
            {getFieldError("step3.accountType") ? (
              <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.accountType")}</p>
            ) : null}
          </div>
        </div>
        <div>
          <Input
            value={step3.accountHolderName || ""}
            onChange={(e) => {
              const v = e.target.value
              const nextState = { ...step3, accountHolderName: v }
              setStep3(nextState)
              if (touched["step3.accountHolderName"]) {
                setFieldError("step3.accountHolderName", validateField("step3.accountHolderName", v, { step1, step2, step3: nextState, step4 }))
              } else {
                clearFieldError("step3.accountHolderName")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              const nextState = { ...step3, accountHolderName: v }
              if (v !== e.target.value) setStep3(nextState)
              markTouched("step3.accountHolderName")
              setFieldError("step3.accountHolderName", validateField("step3.accountHolderName", v, { step1, step2, step3: nextState, step4 }))
            }}
            className={`bg-white text-sm ${getFieldError("step3.accountHolderName") ? "border-red-500" : ""}`}
            placeholder="Account holder name"
          />
          {getFieldError("step3.accountHolderName") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step3.accountHolderName")}</p>
          ) : null}
        </div>
      </section>
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
        <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
        <p className="text-sm text-gray-600">
          Add information that will be displayed to customers on the home page
        </p>

        <div>
          <Label className="text-xs text-gray-700">Estimated Delivery Time*</Label>
          <Input
            value={step4.estimatedDeliveryTime || ""}
            onChange={(e) => {
              const v = e.target.value
              const nextState = { ...step4, estimatedDeliveryTime: v }
              setStep4(nextState)
              if (touched["step4.estimatedDeliveryTime"]) {
                setFieldError("step4.estimatedDeliveryTime", validateField("step4.estimatedDeliveryTime", v, { step1, step2, step3, step4: nextState }))
              } else {
                clearFieldError("step4.estimatedDeliveryTime")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              const nextState = { ...step4, estimatedDeliveryTime: v }
              if (v !== e.target.value) setStep4(nextState)
              markTouched("step4.estimatedDeliveryTime")
              setFieldError("step4.estimatedDeliveryTime", validateField("step4.estimatedDeliveryTime", v, { step1, step2, step3, step4: nextState }))
            }}
            className={`mt-1 bg-white text-sm ${getFieldError("step4.estimatedDeliveryTime") ? "border-red-500" : ""}`}
            placeholder="e.g., 25-30 mins"
          />
          {getFieldError("step4.estimatedDeliveryTime") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step4.estimatedDeliveryTime")}</p>
          ) : null}
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Name*</Label>
          <Input
            value={step4.featuredDish || ""}
            onChange={(e) => {
              const v = e.target.value
              const nextState = { ...step4, featuredDish: v }
              setStep4(nextState)
              if (touched["step4.featuredDish"]) {
                setFieldError("step4.featuredDish", validateField("step4.featuredDish", v, { step1, step2, step3, step4: nextState }))
              } else {
                clearFieldError("step4.featuredDish")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              const nextState = { ...step4, featuredDish: v }
              if (v !== e.target.value) setStep4(nextState)
              markTouched("step4.featuredDish")
              setFieldError("step4.featuredDish", validateField("step4.featuredDish", v, { step1, step2, step3, step4: nextState }))
            }}
            className={`mt-1 bg-white text-sm ${getFieldError("step4.featuredDish") ? "border-red-500" : ""}`}
            placeholder="e.g., Butter Chicken Special"
          />
          {getFieldError("step4.featuredDish") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step4.featuredDish")}</p>
          ) : null}
        </div>

        <div>
          <Label className="text-xs text-gray-700">Featured Dish Price (₹)*</Label>
          <Input
            type="number"
            value={step4.featuredPrice || ""}
            onChange={(e) => {
              const v = e.target.value
              const nextState = { ...step4, featuredPrice: v }
              setStep4(nextState)
              if (touched["step4.featuredPrice"]) {
                setFieldError("step4.featuredPrice", validateField("step4.featuredPrice", v, { step1, step2, step3, step4: nextState }))
              } else {
                clearFieldError("step4.featuredPrice")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              const nextState = { ...step4, featuredPrice: v }
              if (v !== e.target.value) setStep4(nextState)
              markTouched("step4.featuredPrice")
              setFieldError("step4.featuredPrice", validateField("step4.featuredPrice", v, { step1, step2, step3, step4: nextState }))
            }}
            className={`mt-1 bg-white text-sm ${getFieldError("step4.featuredPrice") ? "border-red-500" : ""}`}
            placeholder="e.g., 249"
            min="0"
          />
          {getFieldError("step4.featuredPrice") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step4.featuredPrice")}</p>
          ) : null}
        </div>

        <div>
          <Label className="text-xs text-gray-700">Special Offer/Promotion*</Label>
          <Input
            value={step4.offer || ""}
            onChange={(e) => {
              const v = e.target.value
              const nextState = { ...step4, offer: v }
              setStep4(nextState)
              if (touched["step4.offer"]) {
                setFieldError("step4.offer", validateField("step4.offer", v, { step1, step2, step3, step4: nextState }))
              } else {
                clearFieldError("step4.offer")
              }
            }}
            onBlur={(e) => {
              const v = normalizeTextValue(e.target.value)
              const nextState = { ...step4, offer: v }
              if (v !== e.target.value) setStep4(nextState)
              markTouched("step4.offer")
              setFieldError("step4.offer", validateField("step4.offer", v, { step1, step2, step3, step4: nextState }))
            }}
            className={`mt-1 bg-white text-sm ${getFieldError("step4.offer") ? "border-red-500" : ""}`}
            placeholder="e.g., Flat ₹50 OFF above ₹199"
          />
          {getFieldError("step4.offer") ? (
            <p className="text-[11px] text-red-600 mt-1">{getFieldError("step4.offer")}</p>
          ) : null}
        </div>

        <div>
          <Label className="text-xs text-gray-700">Referral Code (Optional)</Label>
          <Input
            value={step4.referralCode || ""}
            onChange={(e) => setStep4({ ...step4, referralCode: e.target.value.toUpperCase() })}
            className="mt-1 bg-white text-sm"
            placeholder="Enter referral code"
          />
        </div>
      </section>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    if (step === 3) return renderStep3()
    return renderStep4()
  }

  const handleBack = () => {
    if (saving) return
    if (step === 1) {
      clearModuleAuth("restaurant")
      localStorage.removeItem("restaurant_user")
      navigate("/restaurant/login", { replace: true })
      return
    }
    setStep((s) => Math.max(1, s - 1))
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between border-b">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCloseOnboarding}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close onboarding"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-sm font-semibold text-black">Restaurant onboarding</div>
          </div>
          <div className="flex items-center gap-3">
            {import.meta.env.DEV && (
              <Button
                onClick={fillDummyData}
                variant="outline"
                size="sm"
                className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 flex items-center gap-1.5"
                title="Fill with dummy data (Dev only)"
              >
                <Sparkles className="w-3 h-3" />
                Fill Dummy
              </Button>
            )}
            <div className="text-xs text-gray-600">
              Step {step} of 4
            </div>
          </div>
        </header>

        <main
          className="flex-1 px-4 sm:px-6 py-4 space-y-4"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset + 20}px` : undefined }}
          onFocusCapture={(e) => {
            const target = e.target
            if (!(target instanceof HTMLElement)) return
            if (!target.matches("input, textarea, select")) return
            window.setTimeout(() => {
              target.scrollIntoView({ behavior: "smooth", block: "center" })
            }, 250)
          }}
        >
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : (
            renderStep()
          )}
        </main>

        {error && (
          <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <footer className={`px-4 sm:px-6 py-3 bg-white ${keyboardInset ? "hidden" : ""}`}>
          <div className="flex justify-between items-center">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={handleBack}
              className="text-sm text-gray-700 bg-transparent"
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving}
              className="text-sm bg-black text-white px-6"
            >
              {step === 4 ? (saving ? "Saving..." : "Finish") : saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </footer>
      </div>
    </LocalizationProvider>
  )
}
