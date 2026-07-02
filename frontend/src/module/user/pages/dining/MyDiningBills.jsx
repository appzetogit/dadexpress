import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { ArrowLeft, MapPin, Receipt, CheckCircle2, Clock, Trash2 } from "lucide-react"
import { diningAPI } from "@/lib/api"
import Loader from "@/components/Loader"
import AnimatedPage from "../../components/AnimatedPage"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export default function MyDiningBills() {
    const navigate = useNavigate()
    const [bills, setBills] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchBills = async () => {
            try {
                const response = await diningAPI.getMyDiningBills()
                if (response.data.success) {
                    setBills(response.data.data)
                }
            } catch (error) {
                console.error("Error fetching dining bills:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchBills()
    }, [])

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this bill?")) {
            return;
        }

        try {
            const response = await diningAPI.deleteDiningBill(id)
            if (response.data.success) {
                toast.success("Bill deleted successfully")
                setBills(bills.filter(bill => bill._id !== id))
            }
        } catch (error) {
            console.error("Error deleting bill:", error)
            toast.error(error.response?.data?.message || "Failed to delete bill")
        }
    }

    if (loading) return <Loader />

    return (
        <AnimatedPage className="bg-slate-50 min-h-screen pb-10">
            {/* Header */}
            <div className="bg-white p-4 flex items-center shadow-sm sticky top-0 z-10">
                <button onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-6 h-6 text-gray-700 cursor-pointer" />
                </button>
                <h1 className="ml-4 text-xl font-semibold text-gray-800">My Dining Bills</h1>
            </div>

            <div className="p-4 space-y-4">
                {bills.length > 0 ? (
                    bills.map((bill) => (
                        <div key={bill._id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-start gap-4">
                            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100">
                                <img
                                    src={bill.restaurant?.image || bill.restaurant?.profileImage?.url || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=200&q=80"}
                                    className="w-full h-full object-cover"
                                    alt={bill.restaurant?.name}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-900 truncate">{bill.restaurant?.name}</h3>
                                    <Badge className={`${bill.paymentStatus === 'completed' ? 'bg-green-100 text-green-700' :
                                        bill.paymentStatus === 'failed' ? 'bg-red-100 text-red-700' :
                                            'bg-slate-100 text-slate-700'
                                        }`}>
                                        {bill.paymentStatus}
                                    </Badge>
                                    {bill.paymentStatus !== "completed" && (
                                        <button 
                                            onClick={() => handleDelete(bill._id)}
                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 mb-2">
                                    <MapPin className="w-3 h-3" />
                                    <span className="truncate">
                                        {typeof bill.restaurant?.location === 'string'
                                            ? bill.restaurant.location
                                            : (bill.restaurant?.location?.formattedAddress || bill.restaurant?.location?.address || `${bill.restaurant?.location?.city || ''}${bill.restaurant?.location?.area ? ', ' + bill.restaurant.location.area : ''}`)}
                                    </span>
                                </p>

                                <div className="space-y-1.5 mt-2">
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>Bill ID</span>
                                        <span className="font-mono">{bill.billId}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>Date</span>
                                        <span>{new Date(bill.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>Original Amount</span>
                                        <span>₹{bill.billAmount}</span>
                                    </div>
                                    {bill.discountApplied > 0 && (
                                        <div className="flex justify-between text-xs text-green-600">
                                            <span>Cashback Applied</span>
                                            <span>-₹{bill.discountApplied}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-100 mt-1 text-gray-900">
                                        <span>Paid Amount</span>
                                        <span className="text-red-500">₹{bill.finalAmount}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-20">
                        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Receipt className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">No bills yet</h3>
                        <p className="text-gray-500 text-sm mt-2">You haven't paid any dining bills via the app.</p>
                        <Link to="/dining">
                            <button className="mt-6 bg-red-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-red-200">
                                Explore Restaurants
                            </button>
                        </Link>
                    </div>
                )}
            </div>
        </AnimatedPage>
    )
}
