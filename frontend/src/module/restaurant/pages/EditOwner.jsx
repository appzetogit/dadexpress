import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import Lenis from "lenis"
import {
  ArrowLeft,
  User,
  Edit,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { restaurantAPI } from "@/lib/api"
import OptimizedImage from "@/components/OptimizedImage"

const STORAGE_KEY = "restaurant_owner_contact"

export default function EditOwner() {
  const navigate = useNavigate()
  const [ownerData, setOwnerData] = useState({
    name: "",
    phone: "",
    email: "",
    photo: null
  })
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    photo: null
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profileImageFile, setProfileImageFile] = useState(null)
  const fileInputRef = useRef(null)

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  // Fetch restaurant data from backend on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          const ownerDataFromBackend = {
            name: data.ownerName || data.name || "",
            phone: data.ownerPhone || data.primaryContactNumber || data.phone || "",
            email: data.ownerEmail || data.email || "",
            photo: data.profileImage?.url || null
          }
          setOwnerData(ownerDataFromBackend)
          setFormData(ownerDataFromBackend)
        }
      } catch (error) {
        // Only log error if it's not a network/timeout error (backend might be down/slow)
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          console.error("Error fetching restaurant data:", error)
        }
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          if (saved) {
            const parsed = JSON.parse(saved)
            setOwnerData(parsed)
            setFormData(parsed)
          }
        } catch (e) {
          console.error("Error loading owner data from localStorage:", e)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchRestaurantData()
  }, [])

  // Check for changes
  useEffect(() => {
    const changed = 
      formData.name !== ownerData.name ||
      formData.phone !== ownerData.phone ||
      formData.email !== ownerData.email ||
      profileImageFile !== null
    setHasChanges(changed)
  }, [formData.name, formData.phone, formData.email, ownerData.name, ownerData.phone, ownerData.email, profileImageFile])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (file) {
      setProfileImageFile(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        const photoData = e.target?.result
        setFormData(prev => ({
          ...prev,
          photo: photoData
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)

      // First, upload profile image if changed
      if (profileImageFile) {
        try {
          const imageResponse = await restaurantAPI.uploadProfileImage(profileImageFile)
          const imageData = imageResponse?.data?.data?.image || imageResponse?.data?.image
          if (imageData?.url) {
            formData.photo = imageData.url
          }
        } catch (error) {
          console.error("Error uploading profile image:", error)
          alert("Failed to upload profile image. Please try again.")
          setSaving(false)
          return
        }
      }

      // Update owner details in backend
      const updatePayload = {
        ownerName: formData.name.trim(),
        ownerEmail: formData.email.trim(),
        ownerPhone: formData.phone.trim(),
      }

      // If profile image was uploaded, include it
      if (profileImageFile && formData.photo) {
        // Extract publicId from the uploaded image response if available
        // For now, we'll let the backend handle it via the profileImage field
        // The uploadProfileImage already updates it, so we might not need to send it again
      }

      const response = await restaurantAPI.updateProfile(updatePayload)
      
      if (response?.data?.success) {
        // Save to localStorage as backup
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
        } catch (e) {
          console.error("Error saving to localStorage:", e)
        }
        
        // Dispatch event to notify parent page
        window.dispatchEvent(new Event("ownerDataUpdated"))
        window.dispatchEvent(new Event("restaurantProfileRefresh"))
        
        // Update local state
        setOwnerData({ ...formData })
        setProfileImageFile(null)
        setHasChanges(false)
        
        // Navigate back
        navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/restaurant")
      } else {
        throw new Error("Invalid response from server")
      }
    } catch (error) {
      console.error("Error saving owner data:", error)
      alert(`Failed to save owner details: ${error.response?.data?.message || error.message || "Please try again."}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate((window.history?.state?.idx ?? 0) > 0 ? -1 : "/restaurant")}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Contact details</h1>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Profile Photo Section */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
              {loading ? (
                <User className="w-12 h-12 text-gray-500" />
              ) : formData.photo ? (
                <OptimizedImage
                  src={formData.photo}
                  alt="Owner profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-gray-500" />
              )}
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || saving}
            className="text-blue-600 text-sm font-normal hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
            disabled={loading || saving}
          />
        </div>

        {/* Editable Fields */}
        <div className="space-y-4">
          {/* Name Field */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Name</label>
            <div className="relative">
              <Input
                type="text"
                value={loading ? "Loading..." : formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter name"
                className="w-full pr-10"
                disabled={loading || saving}
              />
              <Edit className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
            </div>
          </div>

          {/* Phone Number Field */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Phone number</label>
            <div className="relative">
              <Input
                type="tel"
                value={loading ? "Loading..." : formData.phone}
                onChange={(e) => handleInputChange("phone", e.target.value)}
                placeholder="Enter phone number"
                className="w-full pr-10 focus-visible:border-black focus-visible:ring-0"
                disabled={loading || saving}
              />
              <Edit className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
            </div>
          </div>

          {/* Email Field */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Email</label>
            <div className="relative">
              <Input
                type="email"
                value={loading ? "Loading..." : formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="Enter email address"
                className="w-full pr-10 focus-visible:border-black focus-visible:ring-0"
                disabled={loading || saving}
              />
              <Edit className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

      </div>

      {/* Save Button - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4 z-40">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || loading || saving}
          className={`w-full py-3 ${
            hasChanges && !loading && !saving
              ? "bg-black hover:bg-gray-900 text-white" 
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          } transition-colors`}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}

