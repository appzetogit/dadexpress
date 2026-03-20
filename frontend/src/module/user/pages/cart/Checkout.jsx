import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle, MapPin, CreditCard, ArrowLeft, Coins, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Link } from "react-router-dom"
import AnimatedPage from "../../components/AnimatedPage"
import ScrollReveal from "../../components/ScrollReveal"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useCart } from "../../context/CartContext"
import { useProfile } from "../../context/ProfileContext"
import { useOrders } from "../../context/OrdersContext"
import { useLocation as useUserLocation } from "../../hooks/useLocation"
import { useSelectedDeliveryAddress } from "../../hooks/useSelectedDeliveryAddress"
import { userAPI, orderAPI } from "@/lib/api"
import { toast } from "sonner"
import { resolveDeliveryAddress } from "../../utils/deliveryAddress"

const calculatePlatformFeeFromPercentage = (subtotal = 0, percentage = 0) => {
  const safeSubtotal = Number(subtotal) || 0
  const safePercentage = Number(percentage) || 0
  if (safeSubtotal <= 0 || safePercentage <= 0) return 0
  return (safeSubtotal * safePercentage) / 100
}

export default function Checkout() {
  const navigate = useNavigate()
  const { cart, clearCart } = useCart()
  const { userProfile, getDefaultAddress, getDefaultPaymentMethod, addresses, paymentMethods } = useProfile()
  const { createOrder } = useOrders()
  const { location: currentLocation } = useUserLocation()
  const { selectedDeliveryAddress, setSelectedDeliveryAddress } = useSelectedDeliveryAddress()

  const [selectedAddressId, setSelectedAddressId] = useState("")
  const [selectedAddress, setSelectedAddress] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(getDefaultPaymentMethod()?.id || "")
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [useRewards, setUseRewards] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [referralSettings, setReferralSettings] = useState({
    maxRedemptionPercentage: 20,
    isEnabled: true
  })

  // State for order calculation from API
  const [calculations, setCalculations] = useState({
    subtotal: 0,
    deliveryFee: 0,
    platformFee: 0,
    tax: 0,
    total: 0,
    rewardDiscount: 0
  })

  const rewardBalance = userProfile?.wallet?.balance || 0
  const coinsToInr = 1 // 1 Coin = ₹1

  const fallbackAddress = getDefaultAddress()
  const resolvedDelivery = useMemo(
    () =>
      resolveDeliveryAddress({
        selected: selectedDeliveryAddress,
        addresses,
        currentLocation,
        fallbackAddress,
      }),
    [selectedDeliveryAddress, addresses, currentLocation, fallbackAddress],
  )
  const deliveryAddress = resolvedDelivery.address
  const deliveryAddressError = resolvedDelivery.error

  useEffect(() => {
    if (selectedDeliveryAddress?.mode === "saved" && selectedDeliveryAddress.addressId) {
      setSelectedAddressId(String(selectedDeliveryAddress.addressId))
      return
    }
    if (selectedDeliveryAddress?.mode === "current") {
      setSelectedAddressId("__current__")
      return
    }
    if (resolvedDelivery.source === "current") {
      setSelectedAddressId("__current__")
      return
    }
    const defaultId = fallbackAddress?.id || fallbackAddress?._id || ""
    if (defaultId) {
      setSelectedAddressId(String(defaultId))
    }
  }, [selectedDeliveryAddress, fallbackAddress, resolvedDelivery.source])

  useEffect(() => {
    if (!deliveryAddress) {
      setSelectedAddress(null)
      return
    }
    setSelectedAddress((prev) => {
      const prevId = prev?.id || prev?._id
      const nextId = deliveryAddress?.id || deliveryAddress?._id
      if (prevId && nextId && String(prevId) === String(nextId)) return prev

      const prevCoords = prev?.location?.coordinates || []
      const nextCoords = deliveryAddress?.location?.coordinates || []
      if (prevCoords[0] === nextCoords[0] && prevCoords[1] === nextCoords[1]) {
        return prev
      }
      return deliveryAddress
    })
  }, [deliveryAddress])

  // Fetch referral settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await userAPI.getReferralStats()
        const data = response?.data?.data || response?.data
        if (data?.referralSettings) {
          setReferralSettings(data.referralSettings)
        }
      } catch (err) {
        console.error("Error fetching referral settings:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  // Call calculateOrderPricing whenever dependencies change
  useEffect(() => {
    const calculate = async () => {
      if (cart.length === 0 || !deliveryAddress || deliveryAddressError) return

      try {
        setRefreshing(true)
        const items = cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          restaurantId: item.restaurantId
        }))

        // Call our specialized calculateOrder helper from orderAPI
        const response = await orderAPI.calculateOrder({
          items,
          useRewardCoins: useRewards,
          rewardCoins: useRewards ? rewardBalance : 0,
          deliveryAddress: deliveryAddress,
          latitude: deliveryAddress?.location?.coordinates?.[1],
          longitude: deliveryAddress?.location?.coordinates?.[0],
        })

        const data = response?.data?.data || response?.data
        if (data) {
          setCalculations({
            subtotal: data.pricing?.subtotal || 0,
            deliveryFee: data.pricing?.deliveryFee || 0,
            platformFee: data.pricing?.platformFee || 0,
            tax: data.pricing?.tax || 0,
            total: data.pricing?.total || 0,
            rewardDiscount: data.pricing?.rewardDiscount || 0
          })
        }
      } catch (err) {
        console.error("Error calculating order:", err)
        // Fallback to local calculation if API fails
        const sub = cart.reduce((sum, item) => sum + item.price * item.quantity * 83, 0)
        const df = 2.99 * 83
        const pf = calculatePlatformFeeFromPercentage(sub, 0)
        const tx = sub * 0.08
        const maxRedeem = sub * (referralSettings.maxRedemptionPercentage / 100)
        const disc = useRewards ? Math.min(rewardBalance * coinsToInr, maxRedeem) : 0

        setCalculations({
          subtotal: sub,
          deliveryFee: df,
          platformFee: pf,
          tax: tx,
          total: sub + df + pf + tx - disc,
          rewardDiscount: disc
        })
      } finally {
        setRefreshing(false)
      }
    }

    calculate()
  }, [cart, useRewards, deliveryAddress, rewardBalance, referralSettings])

  const defaultAddress = deliveryAddress || fallbackAddress
  const defaultPayment = paymentMethods.find(pm => pm.id === selectedPayment) || getDefaultPaymentMethod()

  // Destructure calculations for ease of use
  const { subtotal, deliveryFee, platformFee, tax, total, rewardDiscount } = calculations
  const actualRewardDiscount = rewardDiscount

  const handlePlaceOrder = async () => {
    if (!deliveryAddress || !selectedPayment) {
      toast.error("Please select a delivery address and payment method")
      return
    }
    if (deliveryAddressError) {
      toast.error(deliveryAddressError)
      return
    }

    if (cart.length === 0) {
      toast.error("Your cart is empty")
      return
    }

    setIsPlacingOrder(true)

    try {
      // Create order via API
      const orderData = {
        items: cart.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          restaurantId: item.restaurantId
        })),
        address: deliveryAddress,
        deliveryAddress: deliveryAddress?.formattedAddress || deliveryAddress?.address || "",
        latitude: deliveryAddress?.location?.coordinates?.[1],
        longitude: deliveryAddress?.location?.coordinates?.[0],
        paymentMethod: selectedPayment === "cod" ? "cod" : "online",
        useRewardCoins: useRewards,
        rewardCoins: useRewards ? rewardBalance : 0,
      }

      const response = await orderAPI.createOrder(orderData)
      const data = response?.data?.data || response?.data

      if (data?.orderId || data?.id) {
        toast.success("Order placed successfully!")
        clearCart()
        navigate(`/user/orders/${data.orderId || data.id}?confirmed=true`)
      }
    } catch (err) {
      console.error("Error placing order:", err)
      toast.error(err.response?.data?.message || "Failed to place order")
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <Loader2 className="h-10 w-10 text-[#E07832] animate-spin" />
      </div>
    )
  }

  if (cart.length === 0) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-orange-50/30 via-white to-orange-50/20 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg md:text-xl">Checkout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <p className="text-muted-foreground text-lg mb-4">Your cart is empty</p>
                <Link to="/user/cart">
                  <Button>Go to Cart</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-orange-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#1a1a1a] dark:to-[#0a0a0a] p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <ScrollReveal>
          <div className="flex items-center gap-4 mb-6 md:mb-8">
            <Link to="/user/cart">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 md:h-10 md:w-10">
                <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
              </Button>
            </Link>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold dark:text-white">Checkout</h1>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Left Column - Order Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <ScrollReveal delay={0.1}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[#EB590E]" />
                    Delivery Address
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(addresses.length > 0 || currentLocation) ? (
                    <div className="space-y-3">
                      {currentLocation && (
                        <div
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${selectedAddressId === "__current__"
                            ? "border-[#EB590E] bg-orange-50"
                            : "border-gray-200 hover:border-orange-300"
                            }`}
                          onClick={() => {
                            setSelectedAddressId("__current__")
                            setSelectedDeliveryAddress({ mode: "current" })
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <Badge className="mb-2 bg-[#EB590E] text-white">Current Location</Badge>
                              <p className="text-sm font-medium">
                                {currentLocation.formattedAddress || currentLocation.address || "Use current location"}
                              </p>
                            </div>
                            {selectedAddressId === "__current__" && (
                              <CheckCircle className="h-5 w-5 text-[#EB590E]" />
                            )}
                          </div>
                        </div>
                      )}
                      {addresses.map((address) => {
                        const addressId = address.id || address._id
                        const isSelected = selectedAddressId === String(addressId)
                        const addressString = [
                          address.street,
                          address.additionalDetails,
                          `${address.city}, ${address.state} ${address.zipCode}`
                        ].filter(Boolean).join(", ")

                        return (
                          <div
                            key={addressId}
                            className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${isSelected
                              ? "border-[#EB590E] bg-orange-50"
                              : "border-gray-200 hover:border-orange-300"
                              }`}
                            onClick={() => {
                              const nextId = addressId ? String(addressId) : ""
                              setSelectedAddressId(nextId)
                              if (nextId) {
                                setSelectedDeliveryAddress({ mode: "saved", addressId: nextId })
                              }
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                {address.isDefault && (
                                  <Badge className="mb-2 bg-[#EB590E] text-white">Default</Badge>
                                )}
                                <p className="text-sm font-medium">{addressString}</p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-5 w-5 text-[#EB590E]" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {deliveryAddressError && (
                        <p className="text-xs text-red-600">{deliveryAddressError}</p>
                      )}
                      {deliveryAddress && !deliveryAddressError && (
                        <p className="text-xs text-gray-500">
                          {selectedAddressId === "__current__"
                            ? "Using current location"
                            : `Using ${selectedAddress?.label || "saved address"}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No addresses saved</p>
                      <Link to="/user/profile/addresses/new">
                        <Button>Add Address</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ScrollReveal>

            {/* Payment Method */}
            <ScrollReveal delay={0.2}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#EB590E]" />
                    Payment Method
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {paymentMethods.length > 0 ? (
                    <div className="space-y-3">
                      {paymentMethods.map((payment) => {
                        const isSelected = selectedPayment === payment.id
                        const cardNumber = `**** **** **** ${payment.cardNumber}`

                        return (
                          <div
                            key={payment.id}
                            className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${isSelected
                              ? "border-[#EB590E] bg-orange-50"
                              : "border-gray-200 hover:border-orange-300"
                              }`}
                            onClick={() => setSelectedPayment(payment.id)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {payment.isDefault && (
                                    <Badge className="bg-[#EB590E] text-white">Default</Badge>
                                  )}
                                  <Badge variant="outline" className="capitalize">
                                    {payment.type}
                                  </Badge>
                                </div>
                                <p className="font-semibold">{cardNumber}</p>
                                <p className="text-sm text-muted-foreground">
                                  {payment.cardHolder} • Expires {payment.expiryMonth}/{payment.expiryYear.slice(-2)}
                                </p>
                              </div>
                              {isSelected && (
                                <CheckCircle className="h-5 w-5 text-[#EB590E]" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <Link to="/user/profile/payments">
                        <Button variant="outline" className="w-full">
                          Manage Payment Methods
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No payment methods saved</p>
                      <Link to="/user/profile/payments/new">
                        <Button>Add Payment Method</Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ScrollReveal>

            {/* Redeem Rewards */}
            <ScrollReveal delay={0.25}>
              <Card className="border-2 border-orange-100 bg-orange-50/30">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-full">
                      <Coins className="h-5 w-5 text-[#EB590E]" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">Redeem Reward Coins</p>
                      <p className="text-[11px] font-medium text-slate-500">Balance: {rewardBalance} Coins (₹{rewardBalance})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {useRewards && (
                      <span className="text-xs font-black text-green-600">-₹{actualRewardDiscount.toFixed(2)}</span>
                    )}
                    <Switch
                      checked={useRewards}
                      onCheckedChange={setUseRewards}
                      className="data-[state=checked]:bg-[#EB590E]"
                    />
                  </div>
                </CardContent>
                {useRewards && actualRewardDiscount < (rewardBalance * coinsToInr) && (
                  <div className="px-4 pb-3">
                    <p className="text-[10px] text-orange-600 font-bold italic">
                      *Max {referralSettings.maxRedemptionPercentage}% of subtotal can be redeemed per order
                    </p>
                  </div>
                )}
              </Card>
            </ScrollReveal>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <ScrollReveal delay={0.3}>
              <Card className="sticky top-4 md:top-6 dark:bg-[#1a1a1a] dark:border-gray-800">
                <CardHeader>
                  <CardTitle className="text-base md:text-lg lg:text-xl dark:text-white">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6">
                  <div className="space-y-3 md:space-y-4 max-h-64 md:max-h-80 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 md:gap-4 pb-3 md:pb-4 border-b dark:border-gray-700">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm md:text-base dark:text-gray-200">{item.name}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            ₹{(item.price * 83).toFixed(2)} × {item.quantity}
                          </p>
                        </div>
                        <p className="font-semibold text-sm md:text-base dark:text-gray-200">
                          ₹{(item.price * 83 * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 md:space-y-3 pt-4 md:pt-6 border-t dark:border-gray-700">
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="dark:text-gray-200">₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span className="dark:text-gray-200">₹{deliveryFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs md:text-sm">
                      <span className="text-muted-foreground">Platform Fee</span>
                      <span className="dark:text-white">₹{platformFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs md:text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="dark:text-white">₹{tax.toFixed(2)}</span>
                    </div>
                    {useRewards && (
                      <div className="flex justify-between text-xs md:text-sm font-bold text-green-600">
                        <span>Reward Discount</span>
                        <span>-₹{actualRewardDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t dark:border-gray-700 pt-3 md:pt-4 flex justify-between font-bold text-base md:text-lg lg:text-xl">
                      <span className="dark:text-white">Total</span>
                      <span className="dark:text-white">₹{total.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-[#EB590E] hover:bg-[#D94F0C] text-white mt-4 md:mt-6 h-11 md:h-12 text-sm md:text-base border-none"
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder || !deliveryAddress || !!deliveryAddressError || !selectedPayment}
                  >
                    {isPlacingOrder ? "Placing Order..." : "Place Order"}
                  </Button>
                </CardContent>
              </Card>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
