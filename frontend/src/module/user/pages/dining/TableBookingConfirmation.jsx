import { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, Calendar, Users, MapPin, Ticket, ChevronRight, Edit2, ShieldCheck, Info, X, Banknote, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import AnimatedPage from "../../components/AnimatedPage"
import { diningAPI, authAPI } from "@/lib/api"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { toast } from "sonner"
import Loader from "@/components/Loader"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export default function TableBookingConfirmation() {
    const location = useLocation()
    const navigate = useNavigate()
    const { restaurant, guests, date, timeSlot, discount } = location.state || {}

    const [specialRequest, setSpecialRequest] = useState("")
    const [tempSpecialRequest, setTempSpecialRequest] = useState("")
    const [user, setUser] = useState(null)
    const [tempUser, setTempUser] = useState({ name: "", phone: "" })
    const [loading, setLoading] = useState(true)
    const [bookingInProgress, setBookingInProgress] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState("cash")

    // Modals state
    const [isSpecialRequestOpen, setIsSpecialRequestOpen] = useState(false)
    const [isEditDetailsOpen, setIsEditDetailsOpen] = useState(false)

    useEffect(() => {
        if (!restaurant) {
            navigate("/dining")
            return
        }

        const fetchUser = async () => {
            try {
                const response = await authAPI.getCurrentUser()
                if (response.data.success) {
                    setUser(response.data.data)
                    setTempUser({
                        name: response.data.data.name || "",
                        phone: response.data.data.phone || response.data.data.email || ""
                    })
                }
            } catch (error) {
                console.error("Error fetching user:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchUser()
    }, [restaurant, navigate])

    const handleBooking = async () => {
        try {
            setBookingInProgress(true)
            const response = await diningAPI.createBooking({
                restaurant: restaurant._id,
                guests,
                date,
                timeSlot,
                specialRequest,
                guestName: user?.name,
                guestPhone: user?.phone,
                paymentMethod
            })

            if (response.data.success) {
                // UPI payment - Razorpay Gateway open karo
                if (response.data.requiresPayment && response.data.data?.razorpay) {
                    const { razorpay, bookingId } = response.data.data

                    await initRazorpayPayment({
                        key: razorpay.key,
                        amount: razorpay.amount,
                        currency: razorpay.currency || "INR",
                        order_id: razorpay.orderId,
                        name: restaurant?.name || "Dad Express",
                        description: `Table Booking - ${guests} Guest${guests > 1 ? 's' : ''}`,
                        prefill: {
                            name: user?.name || "",
                            contact: user?.phone || "",
                            email: user?.email || "",
                        },
                        handler: async (razorpayResponse) => {
                            try {
                                // Payment success - verify karo aur booking confirm karo
                                const verifyRes = await diningAPI.verifyBookingPayment({
                                    bookingId,
                                    razorpay_order_id: razorpayResponse.razorpay_order_id,
                                    razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                                    razorpay_signature: razorpayResponse.razorpay_signature,
                                })
                                if (verifyRes.data.success) {
                                    toast.success("Payment successful! Booking confirmed!")
                                    navigate("/dining/book-success", { state: { booking: verifyRes.data.data } })
                                }
                            } catch (err) {
                                toast.error("Payment verification failed. Please contact support.")
                            } finally {
                                setBookingInProgress(false)
                            }
                        },
                        onClose: () => {
                            toast.error("Payment cancelled")
                            setBookingInProgress(false)
                        },
                        onError: () => {
                            toast.error("Payment failed. Please try again.")
                            setBookingInProgress(false)
                        },
                    })
                    return // Razorpay handler ke baad proceed nahi karna
                }

                // Cash payment - seedha success page
                toast.success("Table booked successfully!")
                navigate("/dining/book-success", { state: { booking: response.data.data } })
            }
        } catch (error) {
            console.error("Booking error:", error)
            toast.error(error.response?.data?.message || "Failed to confirm booking")
        } finally {
            setBookingInProgress(false)
        }
    }

    const saveSpecialRequest = () => {
        setSpecialRequest(tempSpecialRequest)
        setIsSpecialRequestOpen(false)
        toast.success("Special request added")
    }

    const saveUserDetails = () => {
        setUser(prev => ({ ...prev, name: tempUser.name, phone: tempUser.phone }))
        setIsEditDetailsOpen(false)
        toast.success("Details updated for this booking")
    }

    if (loading) return <Loader />

    const formattedDate = new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-24">
            {/* Header */}
            <div className="bg-[#EB590E] text-white px-4 py-4 sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <p className="font-semibold text-sm">Reach the restaurant 15 minutes before your booking time for a hassle-free experience</p>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Booking Summary Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-[#FFF2EB] p-2 rounded-xl">
                                <Calendar className="w-5 h-5 text-[#EB590E]" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{formattedDate} at {timeSlot}</p>
                                <div className="flex items-center gap-2 text-gray-500 text-sm mt-0.5">
                                    <Users className="w-4 h-4" />
                                    <span>{guests} guests</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 pt-4 border-t border-dashed border-slate-100">
                            <div className="bg-red-50 p-2 rounded-xl">
                                <MapPin className="w-5 h-5 text-red-500" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">{restaurant.name}</p>
                                <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">
                                    {typeof restaurant.location === 'string'
                                        ? restaurant.location
                                        : (restaurant.location?.formattedAddress || restaurant.location?.address || `${restaurant.location?.city || ''}${restaurant.location?.area ? ', ' + restaurant.location.area : ''}`)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-4 border-t border-dashed border-slate-100 text-purple-600">
                            <Ticket className="w-5 h-5" />
                            <span className="font-bold text-sm">{restaurant?.diningSettings?.billCashbackPercentage ?? 10}% cashback</span>
                        </div>
                    </div>
                </div>

                {/* Special Request */}
                <Sheet open={isSpecialRequestOpen} onOpenChange={setIsSpecialRequestOpen}>
                    <SheetTrigger asChild>
                        <button className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="bg-slate-100 p-2 rounded-xl group-hover:bg-slate-200 transition-colors">
                                    <Info className="w-5 h-5 text-slate-600" />
                                </div>
                                <span className="font-bold text-gray-700">
                                    {specialRequest ? "Edit special request" : "Add special request"}
                                </span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-400" />
                        </button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
                        <SheetHeader className="pb-4">
                            <SheetTitle>Add Special Request</SheetTitle>
                        </SheetHeader>
                        <div className="space-y-4">
                            <Textarea
                                placeholder="Any special requests? (e.g. corner table, anniversary celebration)"
                                value={tempSpecialRequest}
                                onChange={(e) => setTempSpecialRequest(e.target.value)}
                                className="min-h-[120px] rounded-xl resize-none"
                            />
                            <Button onClick={saveSpecialRequest} className="w-full h-12 rounded-xl bg-[#EB590E] hover:bg-[#d9520d] text-white font-bold">
                                Save Request
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>

                {/* Preferences Section */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guest Preferences</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="space-y-2">
                        {/* Modification available */}
                        <Sheet>
                            <SheetTrigger asChild>
                                <button className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="text-[#EB590E] mt-1">
                                            <Edit2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">Modification available</p>
                                            <p className="text-xs text-slate-400">Valid till {timeSlot}, today</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                </button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
                                <SheetHeader className="pb-4">
                                    <SheetTitle>Modification Policy</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-4 text-sm text-slate-600">
                                    <p>You can modify your booking details such as guest count or time slot up to 30 minutes before your reservation time.</p>
                                    <p>To modify, please go back to the restaurant page and select your new preferences, or contact the restaurant directly.</p>
                                </div>
                            </SheetContent>
                        </Sheet>

                        {/* Cancellation available */}
                        <Sheet>
                            <SheetTrigger asChild>
                                <button className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="text-red-400 mt-1">
                                            <ShieldCheck className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">Cancellation available</p>
                                            <p className="text-xs text-slate-400">Valid till {timeSlot}, today</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300" />
                                </button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
                                <SheetHeader className="pb-4">
                                    <SheetTitle>Cancellation Policy</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-4 text-sm text-slate-600">
                                    <p>Free cancellation is available up to 30 minutes before your scheduled arrival time.</p>
                                    <p>If you cancel after this time, or fail to show up, any cover charges paid might not be refunded per the restaurant's policy.</p>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>

                {/* Your Details */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Details</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-900">{user?.name || "Guest"}</p>
                            <p className="text-sm text-slate-400 mt-1">{user?.phone || user?.email || ""}</p>
                        </div>
                        <Sheet open={isEditDetailsOpen} onOpenChange={setIsEditDetailsOpen}>
                            <SheetTrigger asChild>
                                <button className="text-red-500 text-sm font-bold hover:underline">Edit</button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8">
                                <SheetHeader className="pb-4">
                                    <SheetTitle>Edit Details</SheetTitle>
                                </SheetHeader>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Name</label>
                                        <Input
                                            value={tempUser.name}
                                            onChange={(e) => setTempUser({ ...tempUser, name: e.target.value })}
                                            placeholder="Enter your name"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                                        <Input
                                            type="tel"
                                            value={tempUser.phone}
                                            onChange={(e) => {
                                                const numericValue = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                setTempUser({ ...tempUser, phone: numericValue });
                                            }}
                                            placeholder="Enter phone number"
                                            className="h-12 rounded-xl"
                                        />
                                    </div>
                                    <Button onClick={saveUserDetails} className="w-full h-12 rounded-xl bg-[#EB590E] hover:bg-[#d9520d] text-white font-bold mt-2">
                                        Save Details
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>

                {/* Select Payment Method */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Method</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        {/* COD Option */}
                        <button
                            type="button"
                            id="payment-cod"
                            onClick={() => setPaymentMethod("cash")}
                            className={`w-full flex items-center gap-4 p-4 text-left transition-all ${
                                paymentMethod === "cash"
                                    ? "bg-orange-50/60"
                                    : "bg-white hover:bg-slate-50"
                            }`}
                        >
                            {/* Radio */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                paymentMethod === "cash" ? "border-[#EB590E]" : "border-slate-300"
                            }`}>
                                {paymentMethod === "cash" && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#EB590E]"></div>
                                )}
                            </div>

                            {/* Icon */}
                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${paymentMethod === "cash" ? "bg-orange-100 text-[#EB590E]" : "bg-slate-100 text-slate-500"}`}>
                                <Banknote className="w-5 h-5" />
                            </div>

                            {/* Text */}
                            <div className="flex-1">
                                <p className="font-bold text-gray-900 text-sm">Cash on Arrival (COD)</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">Pay cash directly at the restaurant</p>
                            </div>

                            {paymentMethod === "cash" && (
                                <span className="text-[10px] font-bold text-[#EB590E] bg-orange-50 border border-orange-200 px-2 py-1 rounded-full flex-shrink-0">Selected</span>
                            )}
                        </button>

                        <div className="h-px bg-slate-100 mx-4"></div>

                        {/* Online Payment Option */}
                        <button
                            type="button"
                            id="payment-online"
                            onClick={() => setPaymentMethod("upi")}
                            className={`w-full flex items-center gap-4 p-4 text-left transition-all ${
                                paymentMethod === "upi"
                                    ? "bg-orange-50/60"
                                    : "bg-white hover:bg-slate-50"
                            }`}
                        >
                            {/* Radio */}
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                paymentMethod === "upi" ? "border-[#EB590E]" : "border-slate-300"
                            }`}>
                                {paymentMethod === "upi" && (
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#EB590E]"></div>
                                )}
                            </div>

                            {/* Icon */}
                            <div className={`p-2.5 rounded-xl flex-shrink-0 ${paymentMethod === "upi" ? "bg-orange-100 text-[#EB590E]" : "bg-slate-100 text-slate-500"}`}>
                                <CreditCard className="w-5 h-5" />
                            </div>

                            {/* Text */}
                            <div className="flex-1">
                                <p className="font-bold text-gray-900 text-sm">Online Payment</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">UPI, Card, Net Banking via Razorpay</p>
                            </div>

                            {paymentMethod === "upi" && (
                                <span className="text-[10px] font-bold text-[#EB590E] bg-orange-50 border border-orange-200 px-2 py-1 rounded-full flex-shrink-0">Selected</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Terms and Conditions */}
                <div className="pt-4">
                    <div className="flex items-center gap-4 mb-3">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terms and Conditions</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>

                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <ul className="space-y-4">
                            {[
                                "Please arrive 15 minutes prior to your reservation time.",
                                "Booking valid for the specified number of guests entered during reservation",
                                "Cover charges upon entry are subject to the discretion of the restaurant",
                                "House rules are to be observed at all times",
                                "Special requests will be accommodated at the restaurant's discretion",
                                "Offers can be availed only by paying via Tastizo",
                                "Cover charges cannot be refunded if slot is cancelled within 30 minutes of slot start time",
                                "Additional service charges on the bill are at the restaurant's discretion"
                            ].map((term, i) => (
                                <li key={i} className="flex gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0"></div>
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium">{term}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Sticky Action Button */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                <Button
                    onClick={handleBooking}
                    disabled={bookingInProgress}
                    className="w-full h-14 bg-[#EB590E] hover:bg-[#d9520d] text-white font-bold text-base rounded-2xl shadow-xl shadow-orange-200 transition-all active:scale-[0.98]"
                >
                    {bookingInProgress
                        ? (paymentMethod === "upi" ? "Opening Payment..." : "Confirming...")
                        : paymentMethod === "upi"
                            ? "Proceed to Pay Online →"
                            : "Confirm Seat (Cash on Arrival)"}
                </Button>
            </div>
        </AnimatedPage>
    )
}

