import { useEffect, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import {
  ArrowLeft,
  ShoppingBag,
  Phone,
  Copy,
  Download,
  User,
  CreditCard,
  Calendar,
  MapPin,
  RotateCcw,
  FileText,
} from "lucide-react"
import { orderAPI, restaurantAPI } from "@/lib/api"
import { toast } from "sonner"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { getCompanyNameAsync } from "@/lib/utils/businessSettings"

export default function UserOrderDetails() {
  const navigate = useNavigate()
  const { orderId } = useParams()
  const [order, setOrder] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true)
        const response = await orderAPI.getOrderDetails(orderId)

        let orderData = null
        if (response?.data?.success && response.data.data?.order) {
          orderData = response.data.data.order
        } else if (response?.data?.order) {
          orderData = response.data.order
        } else {
          toast.error("Order not found")
          navigate("/user/orders")
          return
        }

        setOrder(orderData)

        // If restaurantId is just a string (not populated), fetch restaurant details separately
        const restaurantId = orderData.restaurantId
        if (restaurantId && typeof restaurantId === 'string' && !orderData.restaurant) {
          try {
            const restaurantResponse = await restaurantAPI.getRestaurantById(restaurantId)
            if (restaurantResponse?.data?.success && restaurantResponse.data.data?.restaurant) {
              setRestaurant(restaurantResponse.data.data.restaurant)
            } else if (restaurantResponse?.data?.restaurant) {
              setRestaurant(restaurantResponse.data.restaurant)
            }
          } catch (restaurantError) {
            console.warn("Failed to fetch restaurant details:", restaurantError)
          }
        }
      } catch (error) {
        console.error("Error fetching order details:", error)
        toast.error(
          error?.response?.data?.message || "Failed to load order details"
        )
        navigate("/user/orders")
      } finally {
        setLoading(false)
      }
    }

    if (orderId) {
      fetchOrderDetails()
    }
  }, [orderId, navigate])

  const handleCopyOrderId = async () => {
    if (!order) return
    const id = order.orderId || order._id || orderId
    try {
      await navigator.clipboard.writeText(String(id))
      toast.success("Order ID copied")
    } catch {
      toast.error("Failed to copy Order ID")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-700 text-sm font-medium">Order not found</p>
          <button
            onClick={() => navigate("/user/orders")}
            className="px-4 py-2 rounded-lg bg-[#EB590E] text-white text-sm font-semibold"
          >
            Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const orderIdDisplay = order.orderId || order._id || orderId
  const restaurantObj = restaurant || order.restaurantId || order.restaurant || {}
  const restaurantName = order.restaurantName || restaurantObj.name || "Restaurant"

  const restaurantLocation = (() => {
    const loc = restaurantObj.location || {}
    if (restaurantObj.address) return restaurantObj.address
    if (loc.formattedAddress) return loc.formattedAddress
    if (loc.address) return loc.address
    if (loc.street || loc.city) {
      const parts = [loc.street, loc.area, loc.city, loc.state, loc.zipCode || loc.pincode].filter(Boolean)
      if (parts.length) return parts.join(", ")
    }
    return "Address not available"
  })()

  const items = Array.isArray(order.items) ? order.items : []
  const pricing = order.pricing || {}
  const userName = order.userName || ""
  const userPhone = order.userPhone || ""
  const paymentMethod = order.payment?.method || "Online"
  const paymentDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString("en-IN", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : ""

  const addressText =
    order.address?.formattedAddress ||
    [order.address?.street, order.address?.city, order.address?.state, order.address?.zipCode]
      .filter(Boolean)
      .join(", ")

  const savings =
    (pricing.discount || 0) +
    (pricing.originalItemTotal || 0) -
    (pricing.subtotal || 0)

  const restaurantPhone =
    restaurantObj.primaryContactNumber ||
    restaurantObj.phone ||
    restaurantObj.contactNumber ||
    order.restaurantPhone ||
    ""

  const formatPhone = (phone) => {
    if (!phone) return "";
    let cleaned = phone.toString().trim();
    if (cleaned.startsWith("+91")) return cleaned.slice(3).trim();
    if (cleaned.startsWith("91") && cleaned.length > 10) return cleaned.slice(2).trim();
    return cleaned.replace(/[-\s]/g, "");
  };

  const handleCallRestaurant = () => {
    if (!restaurantPhone) {
      toast.error("Restaurant phone number not available")
      return
    }
    window.location.href = `tel:${formatPhone(restaurantPhone)}`
  }

  const handleDownloadSummary = async () => {
    try {
      const companyName = await getCompanyNameAsync()
      const formatPdfAmount = (value) => `Rs. ${Number(value || 0).toFixed(2)}`
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(`${companyName} Order: Summary and Receipt`, 105, 20, { align: 'center' })
      let yPos = 35
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setFont('helvetica', 'bold'); doc.text('Order ID:', 20, yPos); doc.setFont('helvetica', 'normal'); doc.text(orderIdDisplay, 60, yPos); yPos += 7
      doc.setFont('helvetica', 'bold'); doc.text('Order Time:', 20, yPos); doc.setFont('helvetica', 'normal'); doc.text(paymentDate || 'N/A', 60, yPos); yPos += 7
      doc.setFont('helvetica', 'bold'); doc.text('Customer Name:', 20, yPos); doc.setFont('helvetica', 'normal'); doc.text(userName || 'Customer', 60, yPos); yPos += 7
      doc.setFont('helvetica', 'bold'); doc.text('Delivery Address:', 20, yPos); doc.setFont('helvetica', 'normal'); doc.text(addressText || 'N/A', 60, yPos); yPos += 14
      doc.setFont('helvetica', 'bold'); doc.text('Restaurant Name:', 20, yPos); doc.setFont('helvetica', 'normal'); doc.text(restaurantName, 60, yPos); yPos += 7
      
      const tableData = items.map(item => [
        item.name || 'Item',
        String(item.quantity || item.qty || 1),
        formatPdfAmount(item.price || 0),
        formatPdfAmount((item.price || 0) * (item.quantity || item.qty || 1))
      ])

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Quantity', 'Unit Price', 'Total Price']],
        body: tableData,
      })

      doc.save(`Order_${orderIdDisplay}.pdf`)
      toast.success("Summary downloaded successfully!")
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast.error("Failed to download summary")
    }
  }

  const handleReorder = (order) => {
    if (order.restaurantId) {
      navigate(`/user/restaurants/${order.restaurantId}`)
    } else {
      toast.info('Restaurant information not available')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans relative">
      <div className="bg-white p-4 flex items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
            className="p-1 rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-6 h-6 text-gray-700 cursor-pointer" />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">Order Details</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white p-4 rounded-xl flex items-center gap-3 shadow-sm">
          <div className="bg-gray-100 p-2 rounded-lg">
            <ShoppingBag className="w-6 h-6 text-gray-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">
              {order.status === "delivered" ? "Order was delivered" : "Order status: " + (order.status || "Processing")}
            </h2>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <img
                src={(items[0]?.image) || restaurantObj.profileImage?.url || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100"}
                alt={restaurantName}
                className="w-10 h-10 rounded-lg object-cover"
              />
              <div>
                <h3 className="font-semibold text-gray-800">{restaurantName}</h3>
                <p className="text-xs text-gray-500">{restaurantLocation}</p>
              </div>
            </div>
            <button onClick={handleCallRestaurant} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-[#EB590E] hover:bg-orange-50">
              <Phone className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 uppercase font-medium">Order ID: #{orderIdDisplay}</span>
            <button onClick={handleCopyOrderId}><Copy className="w-3 h-3 text-gray-400" /></button>
          </div>

          <div className="border-t border-dashed border-gray-200 my-3" />

          {items.map((item, idx) => {
            const isVeg = item.isVeg !== undefined ? item.isVeg : (item.category === 'veg' || item.type === 'veg')
            return (
              <div key={idx} className="flex justify-between items-start mt-2">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 border ${isVeg ? "border-green-600" : "border-red-600"} flex items-center justify-center p-[1px] flex-shrink-0 mt-0.5`}>
                    <div className={`w-full h-full rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} />
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{item.quantity} x {item.name}</span>
                </div>
                <span className="text-sm text-gray-800 font-medium">₹{(item.price || 0).toFixed(2)}</span>
              </div>
            )
          })}
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 flex justify-between items-center border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-800">Bill Summary</h3>
            </div>
            <button onClick={handleDownloadSummary} className="w-7 h-7 rounded-full bg-orange-50 flex items-center justify-center text-[#EB590E] hover:bg-orange-100">
              <Download className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Item total</span>
              <span className="text-gray-800">₹{Number(pricing.subtotal || pricing.total || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">GST (govt. taxes)</span>
              <span className="text-gray-800">₹{Number(pricing.tax || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Delivery fee</span>
              <span className="text-[#EB590E] font-medium">{pricing.deliveryFee ? `₹${Number(pricing.deliveryFee).toFixed(2)}` : "FREE"}</span>
            </div>
            <div className="border-t border-gray-100 my-2 pt-2 flex justify-between items-center">
              <span className="font-bold text-gray-800">Paid</span>
              <span className="font-bold text-gray-800">₹{Number(pricing.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm space-y-5">
          <div className="flex gap-3">
             <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center"><User className="w-5 h-5 text-gray-500" /></div>
             <div><h4 className="font-semibold text-gray-800 text-sm">{userName || "Customer"}</h4><p className="text-gray-500 text-xs">{formatPhone(userPhone)}</p></div>
          </div>
          <div className="flex gap-3">
             <div className="mt-0.5"><CreditCard className="w-5 h-5 text-gray-500" /></div>
             <div><h4 className="font-semibold text-gray-800 text-sm">Payment method</h4><p className="text-gray-500 text-xs mt-0.5">Paid via: {paymentMethod.toUpperCase()}</p></div>
          </div>
          <div className="flex gap-3">
             <div className="mt-0.5"><MapPin className="w-5 h-5 text-gray-500" /></div>
             <div><h4 className="font-semibold text-gray-800 text-sm">Delivery address</h4><p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{addressText || "Address not available"}</p></div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 w-full bg-white border-t border-gray-200 p-4 flex gap-3 z-20">
        <button onClick={() => handleReorder(order)} className="flex-1 bg-[#EB590E] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" /> Reorder
        </button>
        <button onClick={handleDownloadSummary} className="flex-1 bg-white border border-[#EB590E] text-[#EB590E] py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Invoice
        </button>
      </div>

      {order && (
        <div className="p-4 pb-24">
          <button
            onClick={() => navigate(`/user/complaints/submit/${encodeURIComponent(order._id || orderId)}`)}
            className="w-full bg-orange-50 border border-orange-200 text-orange-700 py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> Restaurant Complaint
          </button>
        </div>
      )}
    </div>
  )
}
