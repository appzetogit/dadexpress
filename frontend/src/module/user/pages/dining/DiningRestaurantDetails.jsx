import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { restaurantAPI, diningAPI } from "@/lib/api"
import {
    ArrowLeft,
    MapPin,
    Star,
    Phone,
    Navigation,
    Share2,
    Bookmark,
    CheckCircle2,
    Clock,
    UtensilsCrossed
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function DiningRestaurantDetails() {
    const { diningType, slug } = useParams() // Get params from URL
    const navigate = useNavigate()

    const [restaurant, setRestaurant] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const [activeTab, setActiveTab] = useState("Pre-book offers")
    const [isBookingOpen, setIsBookingOpen] = useState(false)
    const [selectedGuests, setSelectedGuests] = useState(2)

    // Fetch data
    useEffect(() => {
        const fetchRestaurant = async () => {
            if (!slug) return
            try {
                setLoading(true)
                // Try fetch by ID/Slug
                // Use specialized dining API that handles both dining and regular restaurants
                const response = await diningAPI.getRestaurantBySlug(slug)

                if (response.data && response.data.success) {
                    const apiRestaurant = response.data.data
                    // Check if this is a dining restaurant with nested restaurant data
                    const actualRestaurant = apiRestaurant?.restaurant || apiRestaurant
                    setRestaurant(actualRestaurant)
                } else {
                    setRestaurant(null)
                    setError("Restaurant not found")
                }
            } catch (err) {
                // If 404, we might need to search list. For now, simple error.
                console.error("Failed to load restaurant", err)

                // FAILSAFE: If API by slug fails, let's try to get list and find match (temporary fix for development if slug isn't unique ID)
                // In a real app, backend should support slug lookup reliably.
                try {
                    const listResp = await restaurantAPI.getRestaurants()
                    if (listResp.data?.data?.restaurants) {
                        const match = listResp.data.data.restaurants.find(r =>
                            r.slug === slug ||
                            r.name.toLowerCase().replace(/\s+/g, '-') === slug.toLowerCase()
                        )
                        if (match) {
                            const actualMatch = match?.restaurant || match
                            setRestaurant(actualMatch)
                            setError(null)
                        } else {
                            setError("Restaurant not found")
                        }
                    }
                } catch (e) {
                    setError("Restaurant not found")
                }
            } finally {
                setLoading(false)
            }
        }
        fetchRestaurant()
    }, [slug])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-[#EB590E]" />
            </div>
        )
    }

    if (error || !restaurant) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
                <h2 className="text-xl font-bold text-slate-800">Restaurant not found</h2>
                <Button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )} className="mt-4" variant="outline">Go Back</Button>
            </div>
        )
    }

    // Helper values
    const coverImage = restaurant.coverImage || restaurant.profileImage?.url || restaurant.logo || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop"
    const formattedDistance = "2.4 km away" // Placeholder or calc
    const rating = restaurant.rating || restaurant.avgRating || 4.5
    const isOpen = restaurant.isAcceptingOrders !== false // simplified check

    if (restaurant.diningSettings && restaurant.diningSettings.isEnabled === false) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                    <UtensilsCrossed className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 mb-2">Dining Unavailable</h2>
                <p className="text-slate-600 mb-6">Dining is currently unavailable for this restaurant.</p>
                <Button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )} variant="outline">Go Back</Button>
            </div>
        )
    }

    const handleCall = () => {
        const phoneNumber = restaurant.primaryContactNumber || restaurant.phone || restaurant.ownerPhone
        if (phoneNumber) {
            window.location.href = `tel:${phoneNumber}`
        } else {
            toast.error("Contact number not available")
        }
    }

    const handleNavigation = () => {
        const address = restaurant.location?.formattedAddress || restaurant.location?.address || restaurant.location || restaurant.address
        const coords = restaurant.location?.coordinates || restaurant.coordinates
        
        let url = ""
        if (coords?.latitude && coords?.longitude) {
            url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`
        } else if (address) {
            url = `https://www.google.com/maps?q=${encodeURIComponent(address)}`
        }

        if (url) {
            window.open(url, "_blank")
        } else {
            toast.error("Location details not available")
        }
    }

    const handlePayBill = () => {
        toast.info("Pay bill feature coming soon! Please pay at the restaurant for now.")
    }

    return (
        <div className="min-h-screen bg-white pb-20 relative">
            {/* Sticky Header / Back Button */}
            <div className="fixed top-0 left-0 w-full z-50 p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
                <button
                    onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
                    className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white pointer-events-auto hover:bg-black/60 transition-colors"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>

                <div className="flex gap-3 pointer-events-auto">
                    <button className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                        <Bookmark className="w-5 h-5" />
                    </button>
                    <button className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Hero Section */}
            <div className="relative h-[45vh] w-full">
                <img
                    src={coverImage}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                />
                {/* Dark Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                {/* Content Overlay */}
                <div className="absolute bottom-0 left-0 w-full p-5 text-white">
                    <h1 className="text-3xl font-bold mb-1">{restaurant.name}</h1>
                    <p className="text-sm text-gray-300 line-clamp-2 max-w-[90%] mb-2">
                        {restaurant.location?.addressLine1 || restaurant.address || "Location not available"}
                    </p>

                    <div className="flex items-center gap-3 text-sm font-medium mb-3">
                        <span>{formattedDistance}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-400"></span>
                        {/* Cost For Two */}
                        <span>{restaurant.costForTwo ? `₹${restaurant.costForTwo} for two` : "₹1400 for two"}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {isOpen ? (
                                <div className="flex items-center gap-1.5 text-green-400 text-xs font-semibold uppercase tracking-wide">
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Open now | 12:00 PM to 11:59 PM</span>
                                </div>
                            ) : (
                                <div className="text-red-400 text-xs font-semibold">Closed</div>
                            )}
                        </div>

                        <div className="flex flex-col items-center bg-green-700/90 backdrop-blur-sm rounded-lg px-2 py-1">
                            <div className="flex items-center gap-1 text-white font-bold text-lg leading-none">
                                {rating} <Star className="w-3 h-3 fill-current" />
                            </div>
                            <span className="text-[10px] text-white/90">{restaurant.totalRatings || 0} Reviews</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons Bar */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 gap-3">
                <Button
                    variant="outline"
                    onClick={() => setIsBookingOpen(true)}
                    className="flex-1 border-gray-200 h-10 text-[#EB590E] hover:text-[#D94F0C] hover:bg-orange-50 font-medium rounded-full"
                >
                    <UtensilsCrossed className="w-4 h-4 mr-2" />
                    Book a table
                </Button>

                <div className="flex gap-3">
                    <button 
                        onClick={handleNavigation}
                        className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-[#EB590E] hover:bg-orange-50"
                    >
                        <Navigation className="w-5 h-5" />
                    </button>
                    <button 
                        onClick={handleCall}
                        className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-[#EB590E] hover:bg-orange-50"
                    >
                        <Phone className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Offer Banner */}
            <div className="px-4 py-4">
                <div className="bg-[#FFF8E8] border border-[#F5D8A0] rounded-xl p-4 relative overflow-hidden">
                    <div className="flex flex-col items-center justify-center text-center z-10 relative">
                        <span className="text-2xl font-black text-[#2D2D2D] tracking-tight">10% CASHBACK</span>
                        <span className="text-xs font-medium text-gray-600 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded mt-1">on every dining bill</span>
                    </div>

                    {/* Decorative Elements mimicking the screenshot */}
                    <div className="absolute top-0 left-0 w-8 h-8 bg-purple-500/20 -rotate-45 transform -translate-x-4 -translate-y-4"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 bg-green-500/20 rotate-45 transform translate-x-4 translate-y-4"></div>
                </div>
            </div>

            {/* Tabs */}
            <div className="sticky top-0 bg-white z-40 border-b border-gray-100 shadow-sm">
                <div className="flex overflow-x-auto no-scrollbar py-1 px-4 gap-6">
                    {["Pre-book offers", "Walk-in offers", "Menu", "Photos", "Reviews", "About"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`whitespace-nowrap py-3 text-sm font-medium transition-colors relative ${activeTab === tab ? "text-[#EB590E]" : "text-gray-500 hover:text-gray-800"
                                }`}
                        >
                            {tab}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#EB590E] rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            <div className="p-4 min-h-[300px]">
                <h3 className="font-bold text-lg mb-4">{activeTab}</h3>
                
                {activeTab === "Menu" && (
                    <div className="grid grid-cols-2 gap-4">
                        {restaurant.menuImages && restaurant.menuImages.length > 0 ? (
                            restaurant.menuImages.map((img, i) => (
                                <div key={i} className="aspect-[3/4] bg-gray-100 rounded-xl overflow-hidden shadow-sm border border-gray-100">
                                    <img src={img.url} alt={`Menu ${i+1}`} className="w-full h-full object-cover" />
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 text-center py-10 text-gray-400">
                                <UtensilsCrossed className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>Menu not available for this restaurant</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "Photos" && (
                    <div className="grid grid-cols-3 gap-2">
                        {[restaurant.profileImage?.url, restaurant.image, ...(restaurant.photos || []).map(p => p.url), ...(restaurant.menuImages || []).map(m => m.url)].filter(Boolean).map((img, i) => (
                            <div key={i} className="aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-100 shadow-sm transition-transform active:scale-95">
                                <img src={img} alt={`Photo ${i+1}`} className="w-full h-full object-cover" />
                            </div>
                        ))}
                        {(!restaurant.profileImage?.url && (!restaurant.menuImages || restaurant.menuImages.length === 0)) && (
                            <div className="col-span-3 text-center py-10 text-gray-400">
                                <p>No photos available</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "Reviews" && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl">
                            <div className="text-4xl font-black text-slate-800">{rating}</div>
                            <div>
                                <div className="flex gap-0.5 mb-1">
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <Star key={s} className={`w-4 h-4 ${s <= Math.floor(rating) ? "fill-green-600 text-green-600" : "text-gray-300"}`} />
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 font-medium">{restaurant.totalRatings || 0} reviews on DadExpress</p>
                            </div>
                        </div>
                        <div className="text-center py-10 text-gray-400">
                            <p className="text-sm font-medium">Be the first to review this restaurant!</p>
                            <Button variant="ghost" className="mt-2 text-[#EB590E] font-bold">Write a review</Button>
                        </div>
                    </div>
                )}

                {activeTab === "About" && (
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm mb-1">Cuisines</h4>
                            <div className="flex flex-wrap gap-2">
                                {restaurant.cuisines?.map(c => (
                                    <span key={c} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold">{c}</span>
                                )) || <span className="text-gray-500 text-sm">Not specified</span>}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm mb-1">Average Cost</h4>
                            <p className="text-gray-600 text-sm">{restaurant.costForTwo ? `₹${restaurant.costForTwo} for two (approx.)` : "₹1400 for two (approx.)"}</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm mb-1">Address</h4>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                {restaurant.location?.addressLine1 || restaurant.location?.formattedAddress || restaurant.address || "Address not available"}
                            </p>
                        </div>
                    </div>
                )}

                {(activeTab === "Pre-book offers" || activeTab === "Walk-in offers") && (
                    <div className="space-y-4">
                         <div className="bg-white border border-green-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
                            <div>
                                <p className="text-green-600 font-bold text-lg">{restaurant.offer || "10% OFF"}</p>
                                <p className="text-gray-500 text-xs font-medium">on early bird bookings</p>
                            </div>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4">Claim</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Booking Footer */}
            {(!restaurant.diningSettings || restaurant.diningSettings.isEnabled) ? (
                <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-100 p-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={() => setIsBookingOpen(true)}
                        className="flex-1 h-12 rounded-xl text-[#EB590E] border-[#EB590E] hover:bg-orange-50 font-bold"
                    >
                        Book a table
                    </Button>
                    <Button
                        className="flex-1 h-12 rounded-xl bg-[#EB590E] hover:bg-[#D94F0C] text-white font-bold flex flex-col items-center justify-center leading-tight py-1"
                        onClick={handlePayBill}
                    >
                        <span className="text-sm">Pay bill</span>
                        <span className="text-[10px] font-normal opacity-90">Tap to view offers</span>
                    </Button>
                </div>
            ) : (
                <div className="fixed bottom-0 left-0 w-full bg-slate-100 border-t border-gray-200 p-4 z-50 text-center">
                    <p className="text-gray-500 font-medium">Dining is currently unavailable for this restaurant.</p>
                </div>
            )}

            {/* Booking Dialog */}
            {isBookingOpen && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/50 pointer-events-auto" onClick={() => setIsBookingOpen(false)} />

                    {/* Modal Panel */}
                    <div className="relative w-full sm:w-[400px] bg-white rounded-t-2xl sm:rounded-2xl p-6 pointer-events-auto animate-in slide-in-from-bottom-5">
                        <h3 className="text-xl font-bold mb-4">Book a Table</h3>

                        <div className="space-y-4">
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-700 block">Number of Guests</label>

                                {/* Manual Input */}
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="1"
                                        max={restaurant.diningSettings?.maxGuests || 6}
                                        value={selectedGuests}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value)
                                            if (!isNaN(val)) {
                                                const max = restaurant.diningSettings?.maxGuests || 6
                                                if (val > max) setSelectedGuests(max)
                                                else if (val < 1) setSelectedGuests(1)
                                                else setSelectedGuests(val)
                                            } else {
                                                setSelectedGuests("")
                                            }
                                        }}
                                        onBlur={(e) => {
                                            if (!selectedGuests || selectedGuests < 1) setSelectedGuests(1)
                                        }}
                                        className="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] transition-all text-lg font-semibold text-center"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
                                        Guests
                                    </span>
                                </div>

                                {/* Scrollable Guest Options */}
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                    {Array.from({ length: restaurant.diningSettings?.maxGuests || 6 }, (_, i) => i + 1).map(num => (
                                        <button
                                            key={num}
                                            onClick={() => setSelectedGuests(num)}
                                            className={`min-w-[40px] h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all flex-shrink-0 ${selectedGuests === num
                                                ? "bg-[#EB590E] text-white shadow-md transform scale-105"
                                                : "bg-white border border-gray-200 text-gray-600 hover:border-orange-200 hover:bg-orange-50"
                                                }`}
                                        >
                                            {num}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button
                                onClick={() => {
                                    setIsBookingOpen(false)
                                    navigate(`/dining/book/${slug}`, { state: { guestCount: selectedGuests } })
                                }}
                                className="w-full bg-[#EB590E] hover:bg-[#D94F0C] text-white font-bold h-12 rounded-xl"
                            >
                                Confirm Booking
                            </Button>
                        </div>

                        <button
                            onClick={() => setIsBookingOpen(false)}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
                        >
                            <span className="sr-only">Close</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

