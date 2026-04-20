import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Building2, Upload, Calendar, CheckCircle2, X, Image as ImageIcon, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { adminAPI, uploadAPI } from "@/lib/api"
import { toast } from "sonner"

const TEN_DIGIT_PHONE_REGEX = /^\d{10}$/
const SIX_DIGIT_PINCODE_REGEX = /^\d{6}$/
const CITY_STATE_REGEX = /^[A-Za-z\s]+$/
const PAN_NUMBER_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const FSSAI_NUMBER_REGEX = /^\d{14}$/
const GST_NUMBER_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const NAME_WITH_CHARS_REGEX = /^(?=.*[A-Za-z])[A-Za-z\s.'-]+$/

const cuisinesOptions = [
    "North Indian", "South Indian", "Chinese", "Pizza",
    "Burgers", "Bakery", "Cafe",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function EditRestaurant() {
    const navigate = useNavigate()
    const { id } = useParams()
    const [step, setStep] = useState(1)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [showSuccessDialog, setShowSuccessDialog] = useState(false)
    const [formErrors, setFormErrors] = useState({})

    // Step 1: Basic Info
    const [step1, setStep1] = useState({
        restaurantName: "",
        ownerName: "",
        ownerEmail: "",
        ownerPhone: "",
        primaryContactNumber: "",
        location: { addressLine1: "", addressLine2: "", area: "", city: "", state: "", pincode: "", landmark: "" },
    })

    // Step 2: Images & Operational
    const [step2, setStep2] = useState({
        menuImages: [],
        profileImage: null,
        cuisines: [],
        openingTime: "09:00",
        closingTime: "22:00",
        openDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    })

    // Step 3: Documents
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

    // Step 4: Display Info
    const [step4, setStep4] = useState({
        estimatedDeliveryTime: "25-30 mins",
        featuredDish: "",
        featuredPrice: "249",
        offer: "",
        costForTwo: "1400",
        tableBookingPrice: "",
        diningSettings: { isEnabled: false, maxGuests: 6, diningType: "family-dining" }
    })

    // Fetch existing restaurant data
    useEffect(() => {
        const fetchRestaurant = async () => {
            try {
                setIsLoading(true)
                const res = await adminAPI.getRestaurantById(id)
                const r = res?.data?.data?.restaurant || res?.data?.restaurant
                if (!r) { toast.error("Restaurant not found"); navigate("/admin/restaurants"); return; }

                // Populate Step 1
                setStep1({
                    restaurantName: r.name || "",
                    ownerName: r.ownerName || "",
                    ownerEmail: r.ownerEmail || "",
                    ownerPhone: r.ownerPhone || "",
                    primaryContactNumber: r.primaryContactNumber || "",
                    location: {
                        addressLine1: r.location?.addressLine1 || "",
                        addressLine2: r.location?.addressLine2 || "",
                        area: r.location?.area || "",
                        city: r.location?.city || "",
                        state: r.location?.state || "",
                        pincode: r.location?.pincode || "",
                        landmark: r.location?.landmark || "",
                    },
                })

                // Populate Step 2 - images stored as objects with url
                setStep2({
                    menuImages: (r.menuImages || []).map(img => (typeof img === 'string' ? { url: img } : img)).filter(Boolean),
                    profileImage: r.profileImage || null,
                    cuisines: r.cuisines || [],
                    openingTime: r.deliveryTimings?.openingTime || "09:00",
                    closingTime: r.deliveryTimings?.closingTime || "22:00",
                    openDays: r.openDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                })

                // Populate Step 3
                setStep3({
                    panNumber: r.panNumber || "",
                    nameOnPan: r.nameOnPan || "",
                    panImage: r.panImage || null,
                    gstRegistered: r.gstRegistered || false,
                    gstNumber: r.gstNumber || "",
                    gstLegalName: r.gstLegalName || "",
                    gstAddress: r.gstAddress || "",
                    gstImage: r.gstImage || null,
                    fssaiNumber: r.fssaiNumber || "",
                    fssaiExpiry: r.fssaiExpiry ? r.fssaiExpiry.substring(0, 10) : "",
                    fssaiImage: r.fssaiImage || null,
                    accountNumber: r.accountNumber || "",
                    confirmAccountNumber: r.accountNumber || "",
                    ifscCode: r.ifscCode || "",
                    accountHolderName: r.accountHolderName || "",
                    accountType: r.accountType || "",
                })

                // Populate Step 4
                setStep4({
                    estimatedDeliveryTime: r.estimatedDeliveryTime || "25-30 mins",
                    featuredDish: r.featuredDish || "",
                    featuredPrice: r.featuredPrice?.toString() || "249",
                    offer: r.offer || "",
                    costForTwo: r.costForTwo?.toString() || "1400",
                    tableBookingPrice: r.tableBookingPrice?.toString() || "",
                    diningSettings: {
                        isEnabled: r.diningSettings?.isEnabled || false,
                        maxGuests: r.diningSettings?.maxGuests || 6,
                        diningType: r.diningSettings?.diningType || "family-dining",
                    }
                })
            } catch (err) {
                console.error("Error fetching restaurant:", err)
                toast.error("Failed to load restaurant data")
                navigate("/admin/restaurants")
            } finally {
                setIsLoading(false)
            }
        }
        if (id) fetchRestaurant()
    }, [id])

    // Upload handler for new images
    const handleUpload = async (file, folder) => {
        try {
            const res = await uploadAPI.uploadMedia(file, { folder })
            const d = res?.data?.data || res?.data
            return { url: d.url, publicId: d.publicId }
        } catch (err) {
            const errorMsg = err?.response?.data?.message || err?.message || "Failed to upload image"
            throw new Error(`Image upload failed: ${errorMsg}`)
        }
    }

    const validateStep1 = () => {
        const errors = {}

        const ownerPhone = (step1.ownerPhone || "").trim()
        const primaryPhone = (step1.primaryContactNumber || "").trim()
        const city = (step1.location?.city || "").trim()
        const state = (step1.location?.state || "").trim()
        const pincode = (step1.location?.pincode || "").trim()

        if (ownerPhone && !TEN_DIGIT_PHONE_REGEX.test(ownerPhone)) {
            errors.ownerPhone = "Phone number must be exactly 10 digits"
        }
        if (primaryPhone && !TEN_DIGIT_PHONE_REGEX.test(primaryPhone)) {
            errors.primaryContactNumber = "Primary phone number must be exactly 10 digits"
        }
        if (city && !CITY_STATE_REGEX.test(city)) {
            errors.city = "City must contain only letters and spaces"
        }
        if (state && !CITY_STATE_REGEX.test(state)) {
            errors.state = "State must contain only letters and spaces"
        }
        if (pincode && !SIX_DIGIT_PINCODE_REGEX.test(pincode)) {
            errors.pincode = "Pin code must be exactly 6 digits"
        }

        return errors
    }

    const validateStep2 = () => {
        const errors = {}
        if (!step2.profileImage) {
            errors.profileImage = "Restaurant profile image is required"
        }
        if (!Array.isArray(step2.menuImages) || step2.menuImages.length === 0) {
            errors.menuImages = "At least one menu image is required"
        }
        if (!Array.isArray(step2.cuisines) || step2.cuisines.length === 0) {
            errors.cuisines = "Please select at least one cuisine"
        }
        return errors
    }

    const validateStep3 = () => {
        const errors = {}
        // Relaxed validation for Edit mode to prevent blocking Step 4
        const panNumber = (step3.panNumber || "").trim().toUpperCase()
        const fssaiNumber = (step3.fssaiNumber || "").trim()
        const accountNumber = (step3.accountNumber || "").trim()
        const ifscCode = (step3.ifscCode || "").trim().toUpperCase()

        if (panNumber && !PAN_NUMBER_REGEX.test(panNumber)) {
            errors.panNumber = "PAN format invalid"
        }
        if (fssaiNumber && !FSSAI_NUMBER_REGEX.test(fssaiNumber)) {
            errors.fssaiNumber = "FSSAI must be 14 digits"
        }
        if (accountNumber && !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
            errors.accountNumber = "Account number length invalid"
        }
        if (ifscCode && !IFSC_REGEX.test(ifscCode)) {
            errors.ifscCode = "IFSC code format invalid"
        }
        return errors
    }

    const handleNext = () => {
        setFormErrors({})
        if (step === 1) {
            const step1Errors = validateStep1()
            if (Object.keys(step1Errors).length > 0) {
                setFormErrors(step1Errors)
                return
            }
        }
        if (step === 2) {
            const step2Errors = validateStep2()
            if (Object.keys(step2Errors).length > 0) {
                setFormErrors(step2Errors)
                return
            }
        }
        if (step === 3) {
            const step3Errors = validateStep3()
            if (Object.keys(step3Errors).length > 0) {
                setFormErrors(step3Errors)
                return
            }
        }
        if (step < 4) {
            setStep(step + 1)
        } else {
            handleSubmit()
        }
    }

    const handleSubmit = async () => {
        setIsSubmitting(true)
        setFormErrors({})
        try {
            const step1Errors = validateStep1()
            const step2Errors = validateStep2()
            const step3Errors = validateStep3()
            const mergedErrors = { ...step1Errors, ...step2Errors, ...step3Errors }
            if (Object.keys(mergedErrors).length > 0) {
                setFormErrors(mergedErrors)
                setIsSubmitting(false)
                return
            }

            // Upload new images (File objects), keep existing URL objects as-is
            let profileImageData = step2.profileImage
            if (step2.profileImage instanceof File) {
                profileImageData = await handleUpload(step2.profileImage, "appzeto/restaurant/profile")
            }

            let menuImagesData = []
            for (const img of (step2.menuImages || [])) {
                if (img instanceof File) {
                    const uploaded = await handleUpload(img, "appzeto/restaurant/menu")
                    menuImagesData.push(uploaded)
                } else if (img?.url) {
                    menuImagesData.push(img)
                }
            }

            let panImageData = step3.panImage
            if (step3.panImage instanceof File) {
                panImageData = await handleUpload(step3.panImage, "appzeto/restaurant/pan")
            }

            let gstImageData = step3.gstImage
            if (step3.gstRegistered && step3.gstImage instanceof File) {
                gstImageData = await handleUpload(step3.gstImage, "appzeto/restaurant/gst")
            }

            let fssaiImageData = step3.fssaiImage
            if (step3.fssaiImage instanceof File) {
                fssaiImageData = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai")
            }

            const payload = {
                restaurantName: step1.restaurantName,
                ownerName: step1.ownerName,
                ownerEmail: step1.ownerEmail,
                ownerPhone: step1.ownerPhone,
                primaryContactNumber: step1.primaryContactNumber,
                location: step1.location,
                menuImages: menuImagesData,
                profileImage: profileImageData,
                cuisines: step2.cuisines,
                openingTime: step2.openingTime,
                closingTime: step2.closingTime,
                openDays: step2.openDays,
                panNumber: step3.panNumber,
                nameOnPan: step3.nameOnPan,
                panImage: panImageData,
                gstRegistered: step3.gstRegistered,
                gstNumber: step3.gstNumber,
                gstLegalName: step3.gstLegalName,
                gstAddress: step3.gstAddress,
                gstImage: gstImageData,
                fssaiNumber: step3.fssaiNumber,
                fssaiExpiry: step3.fssaiExpiry,
                fssaiImage: fssaiImageData,
                accountNumber: step3.accountNumber,
                ifscCode: step3.ifscCode,
                accountHolderName: step3.accountHolderName,
                accountType: step3.accountType,
                estimatedDeliveryTime: step4.estimatedDeliveryTime,
                featuredDish: step4.featuredDish,
                featuredPrice: parseFloat(step4.featuredPrice) || 249,
                offer: step4.offer,
                costForTwo: parseFloat(step4.costForTwo) || 1400,
                tableBookingPrice: step4.tableBookingPrice === ""
                    ? null
                    : (Number.isFinite(Number(step4.tableBookingPrice)) ? Number(step4.tableBookingPrice) : null),
                diningSettings: step4.diningSettings,
            }

            const response = await adminAPI.updateRestaurant(id, payload)
            if (response.data.success) {
                toast.success("Restaurant updated successfully!")
                setShowSuccessDialog(true)
                setTimeout(() => navigate("/admin/restaurants"), 2000)
            } else {
                throw new Error(response.data.message || "Failed to update restaurant")
            }
        } catch (error) {
            console.error("Error updating restaurant:", error)
            const errorMsg = error?.response?.data?.message || error?.message || "Failed to update. Please try again."
            toast.error(errorMsg)
            setFormErrors({ submit: errorMsg })
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderStep1 = () => (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md">
                <h2 className="text-lg font-semibold text-black mb-4">Restaurant information</h2>
                <div>
                    <Label className="text-xs text-gray-700">Restaurant name*</Label>
                    <Input value={step1.restaurantName} onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })} className="mt-1 bg-white text-sm" placeholder="Customers will see this name" />
                </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md">
                <h2 className="text-lg font-semibold text-black mb-4">Owner details</h2>
                <div className="space-y-4">
                    <div>
                        <Label className="text-xs text-gray-700">Full name*</Label>
                        <Input value={step1.ownerName} onChange={(e) => setStep1({ ...step1, ownerName: e.target.value })} className="mt-1 bg-white text-sm" placeholder="Owner full name" />
                    </div>
                    <div>
                        <Label className="text-xs text-gray-700">Email address*</Label>
                        <Input type="email" value={step1.ownerEmail} onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })} className="mt-1 bg-white text-sm" placeholder="owner@example.com" />
                    </div>
                    <div>
                        <Label className="text-xs text-gray-700">Phone number</Label>
                        <Input
                            value={step1.ownerPhone}
                            onChange={(e) => setStep1({ ...step1, ownerPhone: (e.target.value || "").replace(/\D/g, "").slice(0, 10) })}
                            className="mt-1 bg-white text-sm"
                            placeholder="10 digit phone number"
                            inputMode="numeric"
                            maxLength={10}
                        />
                        {formErrors.ownerPhone && <p className="mt-1 text-xs text-red-600">{formErrors.ownerPhone}</p>}
                    </div>
                </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">Restaurant contact & location</h2>
                <div>
                    <Label className="text-xs text-gray-700">Primary contact number</Label>
                    <Input
                        value={step1.primaryContactNumber}
                        onChange={(e) => setStep1({ ...step1, primaryContactNumber: (e.target.value || "").replace(/\D/g, "").slice(0, 10) })}
                        className="mt-1 bg-white text-sm"
                        placeholder="10 digit primary phone number"
                        inputMode="numeric"
                        maxLength={10}
                    />
                    {formErrors.primaryContactNumber && <p className="mt-1 text-xs text-red-600">{formErrors.primaryContactNumber}</p>}
                </div>
                <div className="space-y-3">
                    <Input value={step1.location?.area || ""} onChange={(e) => setStep1({ ...step1, location: { ...step1.location, area: e.target.value } })} className="bg-white text-sm" placeholder="Area / Sector / Locality*" />
                    <Input
                        value={step1.location?.city || ""}
                        onChange={(e) => setStep1({ ...step1, location: { ...step1.location, city: (e.target.value || "").replace(/[^A-Za-z\s]/g, "") } })}
                        className="bg-white text-sm"
                        placeholder="City*"
                    />
                    {formErrors.city && <p className="-mt-2 text-xs text-red-600">{formErrors.city}</p>}
                    <Input value={step1.location?.addressLine1 || ""} onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine1: e.target.value } })} className="bg-white text-sm" placeholder="Shop no. / building no. (optional)" />
                    <Input value={step1.location?.addressLine2 || ""} onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine2: e.target.value } })} className="bg-white text-sm" placeholder="Floor / tower (optional)" />
                    <Input
                        value={step1.location?.state || ""}
                        onChange={(e) => setStep1({ ...step1, location: { ...step1.location, state: (e.target.value || "").replace(/[^A-Za-z\s]/g, "") } })}
                        className="bg-white text-sm"
                        placeholder="State (optional)"
                    />
                    {formErrors.state && <p className="-mt-2 text-xs text-red-600">{formErrors.state}</p>}
                    <Input
                        value={step1.location?.pincode || ""}
                        onChange={(e) => setStep1({ ...step1, location: { ...step1.location, pincode: (e.target.value || "").replace(/\D/g, "").slice(0, 6) } })}
                        className="bg-white text-sm"
                        placeholder="Pin code (optional)"
                        inputMode="numeric"
                        maxLength={6}
                    />
                    {formErrors.pincode && <p className="-mt-2 text-xs text-red-600">{formErrors.pincode}</p>}
                    <Input value={step1.location?.landmark || ""} onChange={(e) => setStep1({ ...step1, location: { ...step1.location, landmark: e.target.value } })} className="bg-white text-sm" placeholder="Nearby landmark (optional)" />
                </div>
            </section>
        </div>
    )

    const renderStep2 = () => (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
                <h2 className="text-lg font-semibold text-black">Menu & photos</h2>

                {/* Menu Images */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-700">Menu images</Label>
                    <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3">
                        <label htmlFor="menuImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border-black text-xs font-medium cursor-pointer w-full">
                            <Upload className="w-4 h-4" />
                            <span>Add more images</span>
                        </label>
                        <input id="menuImagesInput" type="file" multiple accept="image/*" className="hidden"
                            onChange={(e) => {
                                const files = Array.from(e.target.files || [])
                                if (files.length) {
                                    setStep2((prev) => ({ ...prev, menuImages: [...(prev.menuImages || []), ...files] }))
                                    e.target.value = ''
                                }
                            }}
                        />
                    </div>
                    {step2.menuImages.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {step2.menuImages.map((file, idx) => {
                                const imageUrl = file instanceof File ? URL.createObjectURL(file) : (file?.url || file)
                                return (
                                    <div key={idx} className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100">
                                        {imageUrl && <img src={imageUrl} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />}
                                        <button type="button" onClick={() => setStep2((prev) => ({ ...prev, menuImages: prev.menuImages.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    {formErrors.menuImages && <p className="text-xs text-red-600">{formErrors.menuImages}</p>}
                </div>

                {/* Profile Image */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-gray-700">Restaurant profile image</Label>
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                            {step2.profileImage ? (
                                (() => {
                                    const imageSrc = step2.profileImage instanceof File ? URL.createObjectURL(step2.profileImage) : (step2.profileImage?.url || step2.profileImage)
                                    return imageSrc ? <img src={imageSrc} alt="Profile" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-500" />
                                })()
                            ) : (
                                <ImageIcon className="w-6 h-6 text-gray-500" />
                            )}
                        </div>
                        <label htmlFor="profileImageInput" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-black border border-gray-300 text-xs font-medium cursor-pointer">
                            <Upload className="w-4 h-4" />
                            <span>Change</span>
                        </label>
                        <input id="profileImageInput" type="file" accept="image/*" className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0] || null
                                if (file) setStep2((prev) => ({ ...prev, profileImage: file }))
                                e.target.value = ''
                            }}
                        />
                    </div>
                    {formErrors.profileImage && <p className="text-xs text-red-600">{formErrors.profileImage}</p>}
                </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-5">
                {/* Cuisines */}
                <div>
                    <Label className="text-xs text-gray-700">Select cuisines (up to 3)</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {cuisinesOptions.map((cuisine) => {
                            const active = step2.cuisines.includes(cuisine)
                            return (
                                <button key={cuisine} type="button"
                                    onClick={() => {
                                        setStep2((prev) => {
                                            const exists = prev.cuisines.includes(cuisine)
                                            if (exists) return { ...prev, cuisines: prev.cuisines.filter((c) => c !== cuisine) }
                                            if (prev.cuisines.length >= 3) return prev
                                            return { ...prev, cuisines: [...prev.cuisines, cuisine] }
                                        })
                                    }}
                                    className={`px-3 py-1.5 text-xs rounded-full ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
                                >
                                    {cuisine}
                                </button>
                            )
                        })}
                    </div>
                    {formErrors.cuisines && <p className="mt-2 text-xs text-red-600">{formErrors.cuisines}</p>}
                </div>

                {/* Delivery Timings */}
                <div className="space-y-3">
                    <Label className="text-xs text-gray-700">Delivery timings</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-gray-700 mb-1 block">Opening time</Label>
                            <Input type="time" value={step2.openingTime || ""} onChange={(e) => setStep2({ ...step2, openingTime: e.target.value })} className="bg-white text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs text-gray-700 mb-1 block">Closing time</Label>
                            <Input type="time" value={step2.closingTime || ""} onChange={(e) => setStep2({ ...step2, closingTime: e.target.value })} className="bg-white text-sm" />
                        </div>
                    </div>
                </div>

                {/* Open Days */}
                <div className="space-y-2">
                    <Label className="text-xs text-gray-700 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-800" />
                        <span>Open days</span>
                    </Label>
                    <div className="mt-1 grid grid-cols-7 gap-1.5 sm:gap-2">
                        {daysOfWeek.map((day) => {
                            const active = step2.openDays.includes(day)
                            return (
                                <button key={day} type="button"
                                    onClick={() => {
                                        setStep2((prev) => {
                                            const exists = prev.openDays.includes(day)
                                            if (exists) return { ...prev, openDays: prev.openDays.filter((d) => d !== day) }
                                            return { ...prev, openDays: [...prev.openDays, day] }
                                        })
                                    }}
                                    className={`aspect-square flex items-center justify-center rounded-md text-[11px] font-medium ${active ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}
                                >
                                    {day.charAt(0)}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </section>
        </div>
    )

    const renderStep3 = () => (
        <div className="space-y-6">
            {/* PAN */}
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">PAN details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="text-xs text-gray-700">PAN number</Label>
                        <Input
                            value={step3.panNumber || ""}
                            onChange={(e) => setStep3({ ...step3, panNumber: (e.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })}
                            className="mt-1 bg-white text-sm"
                        />
                        {formErrors.panNumber && <p className="mt-1 text-xs text-red-600">{formErrors.panNumber}</p>}
                    </div>
                    <div>
                        <Label className="text-xs text-gray-700">Name on PAN</Label>
                        <Input
                            value={step3.nameOnPan || ""}
                            onChange={(e) => setStep3({ ...step3, nameOnPan: e.target.value.replace(/[^A-Za-z\s.'-]/g, "") })}
                            className="mt-1 bg-white text-sm"
                        />
                        {formErrors.nameOnPan && <p className="mt-1 text-xs text-red-600">{formErrors.nameOnPan}</p>}
                    </div>
                </div>
                <div>
                    <Label className="text-xs text-gray-700">PAN image {step3.panImage?.url && <span className="text-green-600 ml-1">(existing image)</span>}</Label>
                    {step3.panImage?.url && <img src={step3.panImage.url} alt="PAN" className="h-16 w-auto rounded mt-1 border" />}
                    <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, panImage: e.target.files?.[0] || null })} className="mt-1 bg-white text-sm" />
                    {formErrors.panImage && <p className="mt-1 text-xs text-red-600">{formErrors.panImage}</p>}
                </div>
            </section>

            {/* GST */}
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">GST details</h2>
                <div className="flex gap-4 items-center text-sm">
                    <span className="text-gray-700">GST registered?</span>
                    <button type="button" onClick={() => setStep3({ ...step3, gstRegistered: true })} className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}>Yes</button>
                    <button type="button" onClick={() => setStep3({ ...step3, gstRegistered: false })} className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}>No</button>
                </div>
                {step3.gstRegistered && (
                    <div className="space-y-3">
                        <Input
                            value={step3.gstNumber || ""}
                            onChange={(e) => setStep3({ ...step3, gstNumber: (e.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15) })}
                            className="bg-white text-sm"
                            placeholder="GST number"
                        />
                        {formErrors.gstNumber && <p className="-mt-2 text-xs text-red-600">{formErrors.gstNumber}</p>}
                        <Input
                            value={step3.gstLegalName || ""}
                            onChange={(e) => setStep3({ ...step3, gstLegalName: e.target.value.replace(/[^A-Za-z\s.'-]/g, "") })}
                            className="bg-white text-sm"
                            placeholder="Legal name"
                        />
                        {formErrors.gstLegalName && <p className="-mt-2 text-xs text-red-600">{formErrors.gstLegalName}</p>}
                        <Input value={step3.gstAddress || ""} onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })} className="bg-white text-sm" placeholder="Registered address" />
                        {step3.gstImage?.url && <img src={step3.gstImage.url} alt="GST" className="h-16 w-auto rounded border" />}
                        <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, gstImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
                        {formErrors.gstImage && <p className="-mt-2 text-xs text-red-600">{formErrors.gstImage}</p>}
                    </div>
                )}
            </section>

            {/* FSSAI */}
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">FSSAI details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Input
                            value={step3.fssaiNumber || ""}
                            onChange={(e) => setStep3({ ...step3, fssaiNumber: (e.target.value || "").replace(/\D/g, "").slice(0, 14) })}
                            className="bg-white text-sm"
                            placeholder="FSSAI number"
                        />
                        {formErrors.fssaiNumber && <p className="mt-1 text-xs text-red-600">{formErrors.fssaiNumber}</p>}
                    </div>
                    <div>
                        <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date</Label>
                        <Input type="date" value={step3.fssaiExpiry || ""} onChange={(e) => setStep3({ ...step3, fssaiExpiry: e.target.value })} className="bg-white text-sm" />
                        {formErrors.fssaiExpiry && <p className="mt-1 text-xs text-red-600">{formErrors.fssaiExpiry}</p>}
                    </div>
                </div>
                {step3.fssaiImage?.url && <img src={step3.fssaiImage.url} alt="FSSAI" className="h-16 w-auto rounded border" />}
                <Input type="file" accept="image/*" onChange={(e) => setStep3({ ...step3, fssaiImage: e.target.files?.[0] || null })} className="bg-white text-sm" />
            </section>

            {/* Bank */}
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">Bank account details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Input
                            value={step3.accountNumber || ""}
                            onChange={(e) => setStep3({ ...step3, accountNumber: (e.target.value || "").replace(/\D/g, "").slice(0, 18) })}
                            className="bg-white text-sm"
                            placeholder="Account number"
                        />
                        {formErrors.accountNumber && <p className="mt-1 text-xs text-red-600">{formErrors.accountNumber}</p>}
                    </div>
                    <Input value={step3.confirmAccountNumber || ""} onChange={(e) => setStep3({ ...step3, confirmAccountNumber: e.target.value.trim() })} className="bg-white text-sm" placeholder="Re-enter account number" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Input
                            value={step3.ifscCode || ""}
                            onChange={(e) => setStep3({ ...step3, ifscCode: (e.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })}
                            className="bg-white text-sm"
                            placeholder="IFSC code"
                        />
                        {formErrors.ifscCode && <p className="mt-1 text-xs text-red-600">{formErrors.ifscCode}</p>}
                    </div>
                    <div>
                        <select
                            className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                            value={step3.accountType || ""}
                            onChange={(e) => setStep3({ ...step3, accountType: e.target.value })}
                        >
                            <option value="">Select account type</option>
                            <option value="savings">Savings</option>
                            <option value="current">Current</option>
                        </select>
                        {formErrors.accountType && <p className="mt-1 text-xs text-red-600">{formErrors.accountType}</p>}
                    </div>
                </div>
                <div>
                    <Input
                        value={step3.accountHolderName || ""}
                        onChange={(e) => setStep3({ ...step3, accountHolderName: e.target.value.replace(/[^A-Za-z\s.'-]/g, "") })}
                        className="bg-white text-sm"
                        placeholder="Account holder name"
                    />
                    {formErrors.accountHolderName && <p className="mt-1 text-xs text-red-600">{formErrors.accountHolderName}</p>}
                </div>
            </section>
        </div>
    )

    const renderStep4 = () => (
        <div className="space-y-6">
            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">Restaurant Display Information</h2>
                <div>
                    <Label className="text-xs text-gray-700">Estimated Delivery Time</Label>
                    <Input value={step4.estimatedDeliveryTime || ""} onChange={(e) => setStep4({ ...step4, estimatedDeliveryTime: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 25-30 mins" />
                </div>
                <div>
                    <Label className="text-xs text-gray-700">Featured Dish Name</Label>
                    <Input value={step4.featuredDish || ""} onChange={(e) => setStep4({ ...step4, featuredDish: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., Butter Chicken Special" />
                </div>
                <div>
                    <Label className="text-xs text-gray-700">Featured Dish Price (₹)</Label>
                    <Input type="number" value={step4.featuredPrice || ""} onChange={(e) => setStep4({ ...step4, featuredPrice: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 249" min="0" />
                </div>
                <div>
                    <Label className="text-xs text-gray-700">Special Offer/Promotion</Label>
                    <Input value={step4.offer || ""} onChange={(e) => setStep4({ ...step4, offer: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., Flat ₹50 OFF above ₹199" />
                </div>
                <div>
                    <Label className="text-xs text-gray-700">Average Cost for Two (₹)</Label>
                    <Input type="number" value={step4.costForTwo || ""} onChange={(e) => setStep4({ ...step4, costForTwo: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 1400" min="0" />
                </div>
                <div>
                    <Label className="text-xs text-gray-700">Table Booking Price (₹)</Label>
                    <Input type="number" value={step4.tableBookingPrice || ""} onChange={(e) => setStep4({ ...step4, tableBookingPrice: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g., 500" min="0" />
                </div>
            </section>

            <section className="bg-white p-4 sm:p-6 rounded-md space-y-4">
                <h2 className="text-lg font-semibold text-black">Dining Configuration</h2>
                <div className="flex items-center justify-between border p-3 rounded-md">
                    <div>
                        <Label className="text-sm font-medium text-black">Enable Dining</Label>
                        <p className="text-xs text-gray-500">Allow users to book tables</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button"
                            onClick={() => setStep4({ ...step4, diningSettings: { ...step4.diningSettings, isEnabled: !step4.diningSettings?.isEnabled } })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${step4.diningSettings?.isEnabled ? 'bg-black' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${step4.diningSettings?.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-xs font-medium">{step4.diningSettings?.isEnabled ? "Active" : "Inactive"}</span>
                    </div>
                </div>

                {step4.diningSettings?.isEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label className="text-xs text-gray-700">Max Guests per Booking</Label>
                            <Input type="number" min="1" max="50" value={step4.diningSettings?.maxGuests || 6}
                                onChange={(e) => setStep4({ ...step4, diningSettings: { ...step4.diningSettings, maxGuests: parseInt(e.target.value) || 1 } })}
                                className="mt-1 bg-white text-sm" />
                        </div>
                        <div>
                            <Label className="text-xs text-gray-700">Dining Type</Label>
                            <select className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm mt-1"
                                value={step4.diningSettings?.diningType || "family-dining"}
                                onChange={(e) => setStep4({ ...step4, diningSettings: { ...step4.diningSettings, diningType: e.target.value } })}
                            >
                                <option value="family-dining">Family Dining</option>
                                <option value="fine-dining">Fine Dining</option>
                                <option value="cafe">Cafe</option>
                                <option value="casual-dining">Casual Dining</option>
                                <option value="pub-bar">Pub & Bar</option>
                                <option value="buffet">Buffet</option>
                            </select>
                        </div>
                    </div>
                )}
            </section>
        </div>
    )

    const renderStep = () => {
        if (step === 1) return renderStep1()
        if (step === 2) return renderStep2()
        if (step === 3) return renderStep3()
        return renderStep4()
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="text-sm text-gray-600">Loading restaurant data...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <header className="px-4 py-4 sm:px-6 sm:py-5 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <div className="text-sm font-semibold text-black">Edit Restaurant</div>
                </div>
                <div className="text-xs text-gray-600">Step {step} of 4</div>
            </header>

            <main className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                {renderStep()}
            </main>

            {formErrors.submit && (
                <div className="px-4 sm:px-6 pb-2 text-xs text-red-600">{formErrors.submit}</div>
            )}

            <footer className="px-4 sm:px-6 py-3 bg-white">
                <div className="flex justify-between items-center">
                    <Button
                        variant="ghost"
                        disabled={isSubmitting}
                        onClick={() => {
                            if (step === 1) {
                                navigate("/admin/restaurants")
                            } else {
                                setStep((s) => Math.max(1, s - 1))
                            }
                        }}
                        className="text-sm text-gray-700 bg-transparent"
                    >
                        Back
                    </Button>
                    <Button onClick={handleNext} disabled={isSubmitting} className="text-sm bg-black text-white px-6">
                        {step === 4
                            ? (isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes")
                            : isSubmitting ? "Saving..." : "Continue"}
                    </Button>
                </div>
            </footer>

            {/* Success Dialog */}
            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent className="max-w-md bg-white p-0">
                    <div className="p-8 text-center">
                        <div className="flex justify-center mb-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-75"></div>
                                <div className="relative bg-emerald-500 rounded-full p-4">
                                    <CheckCircle2 className="w-12 h-12 text-white" />
                                </div>
                            </div>
                        </div>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-bold text-slate-900 mb-2">Restaurant Updated Successfully!</DialogTitle>
                            <DialogDescription className="text-sm text-slate-600">
                                Changes have been saved and are now live.
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
