import { useEffect, useRef, useState } from "react"
import { gsap } from "gsap"
import Lenis from "lenis"
import { useNavigate, useLocation } from "react-router-dom"
import {
  Home,
  FileText,
  UtensilsCrossed,
  User,
  ArrowLeft,
  ArrowRight,
  Star,
  Briefcase,
  Bike,
  Headphones,
  Ticket,
  Bell,
  ChevronRight,
  IndianRupee,
  Sparkles,
  LogOut,
  X,
  Trash2
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { deliveryAPI } from "@/lib/api"
import { toast } from "sonner"
import { clearModuleAuth } from "@/lib/utils/auth"
import alertSound from "@/assets/audio/alert.mp3"
import originalSound from "@/assets/audio/original.mp3"

export default function ProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [animationKey, setAnimationKey] = useState(0)
  const profileRef = useRef(null)
  const navButtonsRef = useRef(null)
  const sectionsRef = useRef(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(2000)
  const [isReferralEnabled, setIsReferralEnabled] = useState(true)
  const [loadingReferral, setLoadingReferral] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAlertSoundPopup, setShowAlertSoundPopup] = useState(false)
  const [selectedAlertSound, setSelectedAlertSound] = useState(() => {
    // Load from localStorage, default to "zomato_tone"
    return localStorage.getItem('delivery_alert_sound') || 'dadexpress_tone'
  })
  const currentAudioRef = useRef(null)

  useEffect(() => {
    // Initialize Lenis for smooth scrolling
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

    // Small delay to ensure refs are set
    const timeoutId = setTimeout(() => {
      // Reset GSAP animations
      if (profileRef.current) {
        gsap.set(profileRef.current, { opacity: 0, y: 30 })
      }
      if (navButtonsRef.current) {
        gsap.set(navButtonsRef.current, { opacity: 0, y: 30 })
      }
      if (sectionsRef.current) {
        gsap.set(sectionsRef.current, { opacity: 0, y: 30 })
      }

      // GSAP animations
      const tl = gsap.timeline()

      if (profileRef.current) {
        tl.to(profileRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out"
        })
      }

      if (navButtonsRef.current) {
        tl.to(navButtonsRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out"
        }, "-=0.4")
      }

      if (sectionsRef.current) {
        tl.to(sectionsRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out"
        }, "-=0.4")
      }
    }, 100)

    return () => {
      lenis.destroy()
      clearTimeout(timeoutId)
    }
  }, [location.pathname, animationKey])

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profileData = response.data.data.profile
          setProfile(profileData)
        }
      } catch (error) {
        console.error("Error fetching profile:", error)
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  // Fetch referral settings for delivery partner (dynamic referral bonus)
  useEffect(() => {
    const fetchReferralSettings = async () => {
      try {
        setLoadingReferral(true)
        const response = await deliveryAPI.getReferralSettings?.()
          ? await deliveryAPI.getReferralSettings()
          : await deliveryAPI.getDashboard() // fallback; should normally not be used

        const data = response?.data?.data
        const referralEnabled = data?.referralSettings?.isEnabled
        const reward =
          data?.referralSettings?.referrerReward ??
          data?.referralSettings?.referrer_reward

        if (typeof referralEnabled === "boolean") {
          setIsReferralEnabled(referralEnabled)
        }

        if (typeof reward === "number" && reward > 0) {
          setReferralReward(reward)
        }
      } catch (error) {
        console.error("Error fetching delivery referral settings:", error)
      } finally {
        setLoadingReferral(false)
      }
    }

    if (deliveryAPI.getReferralSettings || deliveryAPI.getDashboard) {
      fetchReferralSettings()
    }
  }, [])

  // Listen for refresh events from bottom navigation
  useEffect(() => {
    const handleProfileRefresh = () => {
      setAnimationKey(prev => prev + 1)
      const fetchProfile = async () => {
        try {
          const response = await deliveryAPI.getProfile()
          if (response?.data?.success && response?.data?.data?.profile) {
            setProfile(response.data.data.profile)
          }
        } catch (error) {
          console.error("Error fetching profile:", error)
        }
      }
      fetchProfile()
    }

    window.addEventListener('deliveryProfileRefresh', handleProfileRefresh)

    return () => {
      window.removeEventListener('deliveryProfileRefresh', handleProfileRefresh)
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current.currentTime = 0
        currentAudioRef.current = null
      }
    }
  }, [])

  const handleLogout = async () => {
    if (!window.confirm("Are you sure you want to logout?")) {
      return
    }

    try {
      await deliveryAPI.logout()
    } catch (error) {
      console.error("Logout API error (continuing with local cleanup):", error)
    }

    clearModuleAuth("delivery")
    localStorage.removeItem("delivery_gig_storage")
    localStorage.removeItem("delivery_module_storage")
    localStorage.removeItem("app:isOnline")
    sessionStorage.removeItem("deliveryAuthData")

    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("delivery_")) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))

    window.dispatchEvent(new Event('deliveryAuthChanged'))
    window.dispatchEvent(new Event('onlineStatusChanged'))

    toast.success("Logged out successfully")

    setTimeout(() => {
      navigate("/delivery/sign-in", { replace: true })
    }, 100)
  }

  const handleDeleteAccount = async () => {
    try {
      setIsDeleting(true)
      const response = await deliveryAPI.deleteProfile()
      
      if (response?.data?.success) {
        clearModuleAuth("delivery")
        localStorage.removeItem("delivery_accessToken")
        localStorage.removeItem("delivery_authenticated")
        localStorage.removeItem("delivery_user_authenticated")
        localStorage.removeItem("delivery_user")
        localStorage.removeItem("delivery")
        
        window.dispatchEvent(new Event("deliveryAuthChanged"))
        toast.success("Account deleted successfully")
        
        setTimeout(() => {
          navigate("/delivery/sign-in", { replace: true })
        }, 100)
      } else {
        toast.error(response?.data?.message || "Failed to delete account")
      }
    } catch (error) {
      console.error("Error deleting account:", error)
      toast.error("An error occurred while deleting your account")
    } finally {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const playPreviewSound = (soundFile) => {
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current.currentTime = 0
      }

      const audio = new Audio(soundFile)
      audio.volume = 0.7
      currentAudioRef.current = audio

      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error('❌ Preview audio error:', err)
        })
      }
    } catch (err) {
      console.error('❌ Could not create or play preview audio:', err)
    }
  }

  const handleClosePopup = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setShowAlertSoundPopup(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 font-poppins overflow-x-hidden">
      <div ref={profileRef} className="mb-0">
        <div className="bg-white p-4 w-full shadow-sm">
          <div
            onClick={() => navigate("/delivery/profile/details")}
            className="flex items-start justify-between"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl md:text-3xl font-bold">
                  {loading ? "Loading..." : profile?.name || "Delivery Partner"}
                </h2>
                <ChevronRight className="w-5 h-5" />
              </div>
              <p className="text-gray-600 text-sm md:text-base mb-3">
                {profile?.deliveryId || "N/A"}
              </p>
            </div>
            <div className="relative shrink-0 ml-4">
              {profile?.profileImage?.url ? (
                <img
                  src={profile.profileImage.url}
                  alt="Profile"
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-gray-200"
                  onError={(e) => {
                    if (profile?.documents?.photo) {
                      e.target.src = profile.documents.photo
                    } else {
                      e.target.style.display = 'none'
                      e.target.nextElementSibling?.classList.remove('hidden')
                    }
                  }}
                />
              ) : profile?.documents?.photo ? (
                <img
                  src={profile.documents.photo}
                  alt="Profile"
                  className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-gray-200"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              {(!profile?.profileImage?.url && !profile?.documents?.photo) && (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-300 flex items-center justify-center border-2 border-gray-200">
                  <User className="w-10 h-10 md:w-12 md:h-12 text-gray-500" />
                </div>
              )}
              <div className="absolute bottom-0 right-0 bg-white rounded-full p-2 border-2 border-white">
                <Briefcase className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 pb-24 md:pb-6">
        <div ref={navButtonsRef} className="grid grid-cols-1 gap-3 mb-6">
          <button
            onClick={() => navigate("/delivery/trip-history")}
            className="bg-white rounded-lg p-4 flex flex-col items-center gap-1 hover:bg-gray-200 transition-colors"
          >
            <div className="rounded-lg p-2">
              <Bike className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Trips history</span>
          </button>
        </div>

        <div ref={sectionsRef} className="space-y-4">
          <div>
            <h3 className="text-base font-medium mb-3 px-1">Support</h3>
            <div className="space-y-0">
              <div className="h-px bg-gray-200"></div>
              <Card
                onClick={() => navigate("/delivery/help/tickets")}
                className="bg-white py-0 border-0 shadow-none rounded-none first:rounded-t-lg last:rounded-b-lg cursor-pointer hover:bg-gray-200 transition-colors"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Ticket className="w-5 h-5" />
                    <span className="text-sm font-medium">Support tickets</span>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium mb-3 px-1">Partner options</h3>
            <Card
              onClick={() => setShowAlertSoundPopup(true)}
              className="bg-white py-0 border-0 shadow-none rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5" />
                  <span className="text-sm font-medium">Order alert sound</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </CardContent>
            </Card>
          </div>

          <div className="pt-4 space-y-2">
            <Card
              onClick={handleLogout}
              className="bg-white py-0 border-0 shadow-none rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <LogOut className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-medium text-red-600">Log out</span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
              </CardContent>
            </Card>

            <Card
              onClick={() => setIsDeleteDialogOpen(true)}
              className="bg-white py-0 border border-red-100 shadow-none rounded-lg cursor-pointer hover:bg-red-50 transition-colors"
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-500">Delete Account</span>
                </div>
                <ArrowRight className="w-5 h-5 text-red-300" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {showAlertSoundPopup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Order alert sound</h3>
              <button
                onClick={handleClosePopup}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                <label className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                  <span className="text-base font-medium">Original</span>
                  <input
                    type="radio"
                    name="alertSound"
                    value="original"
                    checked={selectedAlertSound === 'original'}
                    onChange={(e) => {
                      setSelectedAlertSound(e.target.value)
                      localStorage.setItem('delivery_alert_sound', e.target.value)
                      playPreviewSound(originalSound)
                    }}
                    className="w-5 h-5 text-black focus:ring-2 focus:ring-black"
                  />
                </label>
                <label className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 rounded-lg transition-colors">
                  <span className="text-base font-medium">DadExpress Tone</span>
                  <input
                    type="radio"
                    name="alertSound"
                    value="dadexpress_tone"
                    checked={selectedAlertSound === 'dadexpress_tone'}
                    onChange={(e) => {
                      setSelectedAlertSound(e.target.value)
                      localStorage.setItem('delivery_alert_sound', e.target.value)
                      playPreviewSound(alertSound)
                    }}
                    className="w-5 h-5 text-black focus:ring-2 focus:ring-black"
                  />
                </label>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={handleClosePopup}
                className="w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-[340px] rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border-0">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500" size={40} />
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-3 italic uppercase">
                Delete Account?
              </h3>
              
              <p className="text-gray-500 text-base leading-relaxed mb-8">
                Are you sure you want to delete your delivery partner account? This action is permanent and cannot be undone.
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting}
                  className="w-full bg-red-600 text-white font-bold py-4 rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 italic uppercase"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Deleting...
                    </>
                  ) : (
                    "Yes, Delete Account"
                  )}
                </button>
                
                <button
                  onClick={() => setIsDeleteDialogOpen(false)}
                  disabled={isDeleting}
                  className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50 italic uppercase"
                >
                  No, Keep Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
