import { useState, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, IndianRupee, Info, Receipt, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AnimatedPage from "../../components/AnimatedPage"
import { diningAPI } from "@/lib/api"
import { toast } from "sonner"
import { initRazorpayPayment } from "@/lib/utils/razorpay"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

export default function DiningPayBill() {
    const { slug } = useParams()
    const navigate = useNavigate()
    const { state } = useLocation()
    
    const [restaurant, setRestaurant] = useState(state?.restaurant || null)
    const [loading, setLoading] = useState(!state?.restaurant)
    
    const [amount, setAmount] = useState("")
    const [processing, setProcessing] = useState(false)
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        if (restaurant) return // Skip fetch if we already have it from state

        const fetchRestaurant = async () => {
            if (!slug) {
                setLoading(false)
                return
            }
            try {
                const response = await diningAPI.getRestaurantBySlug(slug)
                if (response?.data?.success) {
                    const apiRestaurant = response.data.data
                    const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant
                    if (actualRestaurant) {
                        setRestaurant(actualRestaurant)
                    }
                }
            } catch (error) {
                console.error("Failed to fetch restaurant:", error)
                toast.error("Failed to load restaurant details")
            } finally {
                setLoading(false)
            }
        }
        fetchRestaurant()
    }, [slug, restaurant])

    const handleAmountChange = (e) => {
        const value = e.target.value.replace(/[^0-9.]/g, "")
        if (value === "" || (parseFloat(value) >= 1 && parseFloat(value) <= 100000)) {
            setAmount(value)
        }
    }

    const billAmount = parseFloat(amount) || 0
    
    // Dynamic cashback percentage (default 10%)
    const cashbackPercentage = restaurant?.diningSettings?.billCashbackPercentage || 10
    const discount = Math.round(billAmount * (cashbackPercentage / 100))
    const finalAmount = billAmount - discount

    const handlePayBill = async () => {
        if (!amount || billAmount <= 0) {
            toast.error("Please enter a valid bill amount")
            return
        }

        try {
            setProcessing(true)

            // Initiate bill payment
            const response = await diningAPI.initiateBillPayment({
                restaurantId: restaurant._id || restaurant.restaurant,
                amount: billAmount
            })

            const { bill, razorpay } = response.data.data

            if (!razorpay || !razorpay.orderId || !razorpay.key) {
                throw new Error("Failed to initialize payment gateway")
            }

            const companyName = await getCompanyNameAsync()

            // Initialize Razorpay
            await initRazorpayPayment({
                key: razorpay.key,
                amount: razorpay.amount,
                currency: razorpay.currency,
                order_id: razorpay.orderId,
                name: companyName,
                description: `Dining Bill at ${restaurant.name}`,
                notes: {
                    billId: bill._id,
                    restaurantId: restaurant._id
                },
                theme: { color: '#EF4444' },
                handler: async (response) => {
                    // On success, verify payment
                    try {
                        setProcessing(true)
                        await diningAPI.verifyBillPayment({
                            billId: bill._id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                        
                        toast.success("Bill paid successfully!")
                        setSuccess(true)
                    } catch (verifyError) {
                        console.error("Payment verification failed:", verifyError)
                        toast.error("Payment verification failed. Please contact support.")
                    } finally {
                        setProcessing(false)
                    }
                },
                onError: (error) => {
                    console.error("Payment failed:", error)
                    toast.error("Payment was cancelled or failed")
                    setProcessing(false)
                },
                onClose: () => {
                    toast.info("Payment popup closed")
                    setProcessing(false)
                }
            })

        } catch (error) {
            console.error("Payment error:", error)
            toast.error(error.response?.data?.message || "Failed to initiate payment")
            setProcessing(false)
        }
    }

    if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>
    if (!restaurant) return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-50 relative p-4">
            <div className="absolute top-0 left-0 w-full bg-white px-4 pt-4 pb-4 shadow-sm z-50">
                <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer">
                    <ArrowLeft className="w-6 h-6 text-gray-800" />
                </button>
            </div>
            <div className="text-gray-500 font-medium text-lg mt-12">Restaurant not found</div>
            <Button onClick={() => navigate(-1)} variant="outline" className="mt-4 rounded-xl">Go Back</Button>
        </div>
    )

    if (success) {
        return (
            <AnimatedPage>
                <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-xl shadow-slate-200/50">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 mb-2">Payment Successful!</h1>
                        <p className="text-gray-500 mb-8">Your bill at <span className="font-bold text-gray-800">{restaurant.name}</span> has been paid successfully.</p>
                        
                        <div className="bg-slate-50 rounded-2xl p-4 mb-8 text-left space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Bill Amount</span>
                                <span className="font-semibold">₹{billAmount}</span>
                            </div>
                            <div className="flex justify-between text-sm text-green-600">
                                <span>Cashback ({cashbackPercentage}%)</span>
                                <span className="font-semibold">-₹{discount}</span>
                            </div>
                            <div className="pt-2 border-t border-slate-200 flex justify-between">
                                <span className="font-bold text-gray-900">Paid Amount</span>
                                <span className="font-black text-red-500">₹{finalAmount}</span>
                            </div>
                        </div>

                        <Button onClick={() => navigate(-1)} className="w-full h-14 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold">
                            Go Back
                        </Button>
                    </div>
                </div>
            </AnimatedPage>
        )
    }

    return (
        <AnimatedPage>
            <div className="min-h-screen bg-slate-50 pb-24">
                {/* Header */}
                <div className="bg-white px-4 pt-4 pb-6 shadow-sm sticky top-0 z-50">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer z-50">
                            <ArrowLeft className="w-6 h-6 text-gray-800" />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Pay Bill</h1>
                            <p className="text-xs font-medium text-gray-500">{restaurant.name}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 space-y-6">
                    {/* Amount Input */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <label className="block text-sm font-bold text-gray-700 mb-4 text-center">
                            Enter the bill amount given by the restaurant
                        </label>
                        <div className="relative flex items-center justify-center">
                            <span className="text-4xl font-black text-gray-400 absolute left-8">₹</span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onChange={handleAmountChange}
                                placeholder="0"
                                className="w-full text-5xl font-black text-center text-gray-900 bg-transparent border-none focus:ring-0 placeholder:text-gray-300 py-4"
                            />
                        </div>
                    </div>

                    {/* Bill Summary */}
                    {billAmount > 0 && (
                        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-2">
                                <Receipt className="w-5 h-5 text-gray-400" />
                                Bill Summary
                            </h3>
                            
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">Original Amount</span>
                                <span className="font-bold text-gray-900">₹{billAmount}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-green-600 bg-green-50 p-3 rounded-2xl">
                                <span className="font-bold flex items-center gap-1">
                                    <Info className="w-4 h-4" />
                                    {cashbackPercentage}% Cashback Applied
                                </span>
                                <span className="font-black">-₹{discount}</span>
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-lg font-black text-gray-900">Amount to Pay</span>
                                <span className="text-2xl font-black text-red-500">₹{finalAmount}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Pay Button */}
                <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-50">
                    <Button
                        onClick={handlePayBill}
                        disabled={!amount || billAmount <= 0 || processing}
                        className={`w-full h-14 rounded-2xl font-bold text-lg transition-all ${
                            amount && billAmount > 0
                                ? "bg-red-500 hover:bg-red-600 text-white shadow-xl shadow-red-200"
                                : "bg-slate-100 text-slate-400"
                        }`}
                    >
                        {processing ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </div>
                        ) : (
                            `Pay ₹${finalAmount}`
                        )}
                    </Button>
                </div>
            </div>
        </AnimatedPage>
    )
}
