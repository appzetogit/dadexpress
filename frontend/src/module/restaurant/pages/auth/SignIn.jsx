import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { restaurantAPI } from "@/lib/api"
import { setAuthData } from "@/lib/utils/auth"
import { Mail, Lock, EyeOff, Eye, CheckSquare, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { firebaseAuth, googleProvider, ensureFirebaseInitialized, requestFcmToken } from "@/lib/firebase"
import loginBg from "@/assets/loginbanner.png"
import { useCompanyName } from "@/lib/hooks/useCompanyName"

export default function RestaurantSignIn() {
  const isDev = import.meta.env?.DEV === true
  const debugLog = (...args) => {
    if (isDev) console.log(...args)
  }
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const redirectHandledRef = useRef(false)
  const companyName = useCompanyName()

  const normalizeRestaurantSessionData = (restaurantData) => {
    if (!restaurantData || typeof restaurantData !== "object") return restaurantData
    if (restaurantData.isProfileCompleted === true) return restaurantData
    if (restaurantData?.isActive === true) {
      return { ...restaurantData, isProfileCompleted: true }
    }
    if (restaurantData?.signupMethod === "google" || !!restaurantData?.googleId) {
      return { ...restaurantData, isProfileCompleted: true }
    }

    const completedSteps = Number(restaurantData?.onboarding?.completedSteps)
    const hasOnboardingObject =
      restaurantData?.onboarding !== undefined && restaurantData?.onboarding !== null

    const isProfileCompleted = Number.isFinite(completedSteps)
      ? completedSteps >= 4
      : (
        !hasOnboardingObject &&
        (restaurantData?.isActive === true || restaurantData?.signupMethod === "google")
      )

    return { ...restaurantData, isProfileCompleted }
  }

  // Redirect to restaurant home if already authenticated
  useEffect(() => {
    const isAuthenticated = localStorage.getItem("restaurant_authenticated") === "true"
    if (isAuthenticated) {
      navigate("/restaurant", { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    redirectHandledRef.current = true
  }, [])

  const processSignedInUser = async (user, source = "unknown") => {
    if (redirectHandledRef.current) {
      debugLog(`ℹ️ User already being processed, skipping (source: ${source})`)
      return
    }

    debugLog(`✅ Processing signed-in user from ${source}:`, {
      email: user.email,
      uid: user.uid,
      displayName: user.displayName
    })

    redirectHandledRef.current = true
    setIsLoading(true)
    setError("")

    try {
      const idToken = await user.getIdToken()
      debugLog(`✅ Got ID token from ${source}, calling backend...`)

      const fcmToken = await requestFcmToken()
      if (fcmToken) {
        debugLog("[PUSH-NOTIFICATION] Sending FCM token for restaurant Google login from " + source + ":", fcmToken)
      }

      const response = await restaurantAPI.firebaseGoogleLogin(idToken, fcmToken, "web")
      const data = response?.data?.data || {}

      debugLog(`✅ Backend response from ${source}:`, {
        hasAccessToken: !!data.accessToken,
        hasRestaurant: !!data.restaurant,
        restaurantEmail: data.restaurant?.email
      })

      const accessToken = data.accessToken
      const restaurant = normalizeRestaurantSessionData(data.restaurant)

      if (accessToken && restaurant) {
        setAuthData("restaurant", accessToken, restaurant)
        window.dispatchEvent(new Event("restaurantAuthChanged"))

        const hasHash = window.location.hash.length > 0
        const hasQueryParams = window.location.search.length > 0
        if (hasHash || hasQueryParams) {
          window.history.replaceState({}, document.title, window.location.pathname)
        }

        debugLog(`✅ Navigating to restaurant dashboard from ${source}...`)
        navigate("/restaurant", { replace: true })
      } else {
        console.error(`❌ Invalid backend response from ${source}`)
        redirectHandledRef.current = false
        setIsLoading(false)
        setError("Invalid response from server. Please try again.")
      }
    } catch (err) {
      console.error(`❌ Error processing user from ${source}:`, err)
      console.error("Error details:", {
        code: err?.code,
        message: err?.message,
        response: err?.response?.data
      })
      redirectHandledRef.current = false
      setIsLoading(false)

      let errorMessage = "Failed to complete sign-in. Please try again."
      if (err?.response?.data?.message) {
        errorMessage = err.response.data.message
      } else if (err?.message) {
        errorMessage = err.message
      }
      
      // Sanitize database error messages
      if (errorMessage.includes("E11000") || errorMessage.includes("duplicate key") || errorMessage.includes("index:")) {
        errorMessage = "An account with this information already exists. Please try logging in instead."
      }
      
      setError(errorMessage)
    }
  }

  useEffect(() => {
    let unsubscribe = null

    const setupAuthListener = async () => {
      try {
        const { onAuthStateChanged } = await import("firebase/auth")
        ensureFirebaseInitialized()

        debugLog("🔔 Setting up auth state listener...")

        unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
          debugLog("🔔 Auth state changed:", {
            hasUser: !!user,
            userEmail: user?.email,
            redirectHandled: redirectHandledRef.current
          })

          if (user && !redirectHandledRef.current) {
            await processSignedInUser(user, "auth-state-listener")
          }
        })
      } catch (err) {
        console.error("❌ Error setting up auth state listener:", err)
      }
    }

    setupAuthListener()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      // Login with restaurant auth endpoint
      const response = await restaurantAPI.login(email, password)
      const data = response?.data?.data || response?.data
      
      if (data.accessToken && data.restaurant) {
        // Replace old token with new one (handles cross-module login)
        setAuthData("restaurant", data.accessToken, data.restaurant)
        
        // Dispatch custom event for same-tab updates
        window.dispatchEvent(new Event('restaurantAuthChanged'))
        
        navigate("/restaurant", { replace: true })
      } else {
        throw new Error("Login failed. Please try again.")
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed. Please check your credentials."
      setError(message)
    } finally {
    setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError("")
    setIsLoading(true)
    redirectHandledRef.current = false

    try {
      ensureFirebaseInitialized()

      if (!firebaseAuth) {
        throw new Error("Firebase Auth is not initialized. Please check your Firebase configuration.")
      }

      const { signInWithPopup, GoogleAuthProvider, signInWithCredential, signOut } = await import("firebase/auth")

      // Ensure stale Firebase session does not auto-pick previous account.
      if (firebaseAuth?.currentUser) {
        await signOut(firebaseAuth)
      }

      let user = null

      if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
        debugLog("📱 Starting Google sign-in via Flutter native bridge...")
        try {
          const result = await window.flutter_inappwebview.callHandler("nativeGoogleSignIn")

          if (result && result.success && result.idToken) {
            const idToken = result.idToken
            const credential = GoogleAuthProvider.credential(idToken)
            const userCredential = await signInWithCredential(firebaseAuth, credential)
            user = userCredential.user
            debugLog("✅ Website login successful via Flutter App!")
          } else {
            debugLog("ℹ️ User cancelled native sign in. Staying on login page (no web popup fallback).")
            redirectHandledRef.current = true
            setIsLoading(false)
            return
          }
        } catch (err) {
          console.error("❌ Flutter Bridge Error during Google sign-in:", err)
          redirectHandledRef.current = true
          setIsLoading(false)
          return
        }
      } else {
        debugLog("🚀 Starting Google sign-in popup (web browser)...")
        const result = await signInWithPopup(firebaseAuth, googleProvider)
        user = result?.user || null
      }

      if (user) {
        debugLog("✅ Google sign-in successful, processing user...")
        await processSignedInUser(user, window.flutter_inappwebview ? "flutter-bridge" : "popup-result")
      } else {
        debugLog("ℹ️ No user returned from Google sign-in (might have been closed)")
        setIsLoading(false)
      }
    } catch (err) {
      console.error("❌ Google sign-in popup error:", err)
      setIsLoading(false)
      redirectHandledRef.current = true

      const errorCode = err?.code || ""
      const errorMessage = err?.message || ""

      let message = "Google sign-in failed. Please try again."

      if (errorCode === "auth/popup-closed-by-user") {
        message = "Sign-in was cancelled. Please try again."
      } else if (errorCode === "auth/popup-blocked") {
        message = "Popup was blocked. Please allow popups and try again."
      } else if (errorCode === "auth/configuration-not-found") {
        message = "Firebase configuration error. Please ensure your domain is authorized in Firebase Console."
      } else if (errorCode === "auth/network-request-failed") {
        message = "Network error. Please check your connection and try again."
      } else if (errorMessage) {
        message = errorMessage
      }

      setError(message)
    }
  }

  return (
    <div className="h-screen w-full flex bg-white overflow-hidden">
      {/* Left image section */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src={loginBg}
          alt="Restaurant background"
          className="w-full h-full object-cover"
        />
        {/* Orange half-circle text block attached to the left with animation */}
        <div className="absolute inset-0 flex items-center text-white pointer-events-none">
          <div
            className="bg-primary-orange/80 rounded-r-full py-10 xl:py-20 pl-10 xl:pl-14 pr-10 xl:pr-20 max-w-[70%] shadow-xl backdrop-blur-[1px]"
            style={{ animation: "slideInLeft 0.8s ease-out both" }}
          >
            <h1 className="text-3xl xl:text-4xl font-extrabold mb-4 tracking-wide leading-tight">
              WELCOME TO
              <br />
              {companyName.toUpperCase()}
            </h1>
            <p className="text-base xl:text-lg opacity-95 max-w-xl">
              Manage your restaurant, orders and website easily from a single dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Right form section */}
      <div className="w-full lg:w-1/2 h-full flex flex-col">
        {/* Top logo and version */}
        <div className="relative flex items-center justify-center px-6 sm:px-10 lg:px-16 pt-6 pb-4">
          <div
            className="flex items-center gap-3"
            style={{ animation: "fadeInDown 0.7s ease-out both" }}
          >
            <div className="h-11 w-11 rounded-xl bg-primary-orange flex items-center justify-center text-white shadow-lg">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-2xl font-bold tracking-wide text-primary-orange">
                {companyName}
              </span>
              <span className="text-xs font-medium text-gray-500">
                Restaurant Panel
              </span>
            </div>
          </div>
          <div className="absolute right-6 sm:right-10 lg:right-16 top-6 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700 shadow-sm">
            Software Version : 1.0.0
          </div>
        </div>

        {/* Centered content (title + form + info) */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 lg:px-16 pb-8"
          style={{ animation: "fadeInUp 0.8s ease-out 0.15s both" }}
        >
          {/* Title */}
          <div className="mb-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">
              Signin To Your Restaurant Panel
            </h2>
            <p className="text-sm text-gray-500">
              Enter your credentials to access the restaurant dashboard.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 w-full max-w-lg rounded-xl bg-white/80 backdrop-blur-sm p-1 sm:p-2"
          >
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                Your Email
              </Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                  <Mail className="h-4 w-4" />
                </span>
                <Input
                  id="email"
                  type="email"
                  placeholder="test.restaurant@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-9 border-gray-300 rounded-md shadow-sm focus-visible:ring-primary-orange focus-visible:ring-2 transition-colors placeholder:text-gray-400"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                  <Lock className="h-4 w-4" />
                </span>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-9 pr-10 border-gray-300 rounded-md shadow-sm focus-visible:ring-primary-orange focus-visible:ring-2 transition-colors placeholder:text-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                  className="border-gray-300 data-[state=checked]:bg-primary-orange data-[state=checked]:border-primary-orange"
                />
                <span className="text-gray-700">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => navigate("/restaurant/forgot-password")}
                className="text-primary-orange hover:underline font-medium"
              >
                Forgot Password
              </button>
            </div>

            {/* Sign in button */}
            <Button
              type="submit"
              className="mt-2 h-11 w-full bg-primary-orange hover:bg-primary-orange/90 text-white text-base font-semibold rounded-md shadow-md transition-colors"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-xs text-gray-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="h-11 w-full rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoading}
            >
              <span className="flex items-center justify-center gap-3">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continue with Google</span>
              </span>
            </button>
          </form>

          {/* Sign up link */}
          <div className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/restaurant/signup-email")}
              className="text-primary-orange hover:underline font-medium"
            >
              Sign up
            </button>
          </div>

          {/* Demo credentials / info bar */}
          <div className="mt-8 w-full max-w-lg rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-xs sm:text-sm text-gray-800 flex items-start gap-3">
            <div className="mt-0.5 text-primary-orange">
              <CheckSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold mb-1">Demo Credentials</div>
              <div>
                <span className="font-semibold">Email :</span> test.restaurant@gmail.com
              </div>
              <div>
                <span className="font-semibold">Password :</span> 12345678
              </div>
            </div>
          </div>
        </div>

        {/* Simple keyframe animations */}
        <style>{`
          @keyframes slideInLeft {
            from {
              opacity: 0;
              transform: translateX(-40px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes fadeInDown {
            from {
              opacity: 0;
              transform: translateY(-16px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </div>
  )
}

