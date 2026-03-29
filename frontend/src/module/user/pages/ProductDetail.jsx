// old one 



import { useState, useMemo, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"

import { ArrowLeft, Star, Clock, MapPin, ShoppingBag, Plus, Minus, Calendar, ThumbsUp, MessageCircle, Send } from "lucide-react"
import AnimatedPage from "../components/AnimatedPage"
import Footer from "../components/Footer"
import ScrollReveal from "../components/ScrollReveal"
import { useCart } from "../context/CartContext"
import { useOrders } from "../context/OrdersContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart, isInCart, getCartItem, updateQuantity } = useCart()
  const { getAllOrders } = useOrders()

  const [product, setProduct] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: "",
  })
  const [reviews, setReviews] = useState([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [helpfulVotes, setHelpfulVotes] = useState(new Set())
  const [replyStates, setReplyStates] = useState({})
  const [replies, setReplies] = useState({})

  // Fetch product details from backend (dynamic, DB-driven)
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true)
        setError("")

        const response = await import("@/lib/api").then((m) =>
          m.publicAPI.getMenuItemById(id)
        )

        const item = response?.data?.data?.item

        if (!response?.data?.success || !item) {
          setError("Product not found")
          setProduct(null)
          setRestaurant(null)
          setReviews([])
          setReviewsCount(0)
          return
        }

        const mappedProduct = {
          id: item.id,
          name: item.name?.toLowerCase().includes("size") ? item.name.replace(/size/gi, "").trim() : item.name,
          image:
            item.image ||
            (Array.isArray(item.images) && item.images.length > 0
              ? item.images[0]
              : "https://via.placeholder.com/800x600?text=Food+Image"),
          price:
            typeof item.price === "number"
              ? item.price
              : item.variations?.[0]?.price || 0,
          rating: typeof item.rating === "number" ? item.rating : 0,
          description: item.description || "",
          category: item.category || "Varieties",
          preparationTime: item.preparationTime || "20-30 min",
          calories: item.calories || null,
          ingredients:
            Array.isArray(item.ingredients) && item.ingredients.length > 0
              ? item.ingredients
              : [],
          reviews: typeof item.reviews === "number" ? item.reviews : 0,
          restaurantId: item.restaurant?._id || item.restaurantId || null,
          restaurant: item.restaurant?.name || item.restaurantName || "",
          isVeg: item.isVeg === true || item.foodType === 'Veg'
        }

        const restaurantFromItem = item.restaurant || null
        const mappedRestaurant = restaurantFromItem
          ? {
              name: restaurantFromItem.name,
              cuisine: Array.isArray(restaurantFromItem.cuisines)
                ? restaurantFromItem.cuisines.join(", ")
                : "",
              rating:
                typeof restaurantFromItem.rating === "number"
                  ? restaurantFromItem.rating
                  : mappedProduct.rating,
              deliveryTime: restaurantFromItem.estimatedDeliveryTime
                ? `${restaurantFromItem.estimatedDeliveryTime} min`
                : undefined,
              distance: "",
              priceRange: "₹",
            }
          : null

        setProduct(mappedProduct)
        setRestaurant(mappedRestaurant)
        setReviews([]) // detailed review list not wired yet
        setReviewsCount(mappedProduct.reviews)
      } catch (err) {
        console.error("Error fetching product details:", err)
        setError("Failed to load product")
        setProduct(null)
        setRestaurant(null)
        setReviews([])
        setReviewsCount(0)
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchProduct()
    }
  }, [id])

  const inCart = product ? isInCart(product.id) : false
  const cartItem = product ? getCartItem(product.id) : null
  const orders = getAllOrders()

  // Get order history for this product
  const orderHistory = useMemo(() => {
    if (!product) return []
    return orders.filter(order =>
      order.items?.some(item => item.id === product.id)
    ).slice(0, 5) // Show last 5 orders
  }, [orders, product])

  // Calculate average rating
  const averageRating = useMemo(() => {
    if (reviews.length === 0) return product?.rating || 0
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
    return Math.round((sum / reviews.length) * 10) / 10
  }, [reviews, product])

  const handleAddToCart = () => {
    if (product) {
      for (let i = 0; i < quantity; i++) {
        addToCart(product)
      }
    }
  }

  const handleIncrease = () => {
    if (inCart && cartItem) {
      updateQuantity(product.id, cartItem.quantity + 1)
    } else {
      setQuantity(prev => prev + 1)
    }
  }

  const handleDecrease = () => {
    if (inCart && cartItem) {
      if (cartItem.quantity > 1) {
        updateQuantity(product.id, cartItem.quantity - 1)
      }
    } else {
      setQuantity(prev => Math.max(1, prev - 1))
    }
  }

  const handleSubmitReview = (e) => {
    e.preventDefault()
    if (!reviewForm.comment.trim()) {
      alert("Please write a review comment")
      return
    }

    const newReview = {
      id: reviews.length + 1,
      userName: "You",
      userAvatar: `https://ui-avatars.com/api/?name=You&background=ffc107&color=fff&size=128`,
      rating: reviewForm.rating,
      comment: reviewForm.comment,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      helpful: 0,
      verified: true,
      orderType: "Delivery"
    }

    setReviews([newReview, ...reviews])
    setReviewForm({ rating: 5, comment: "" })
    setShowReviewForm(false)
    alert("Thank you for your review!")
  }

  const handleHelpful = (reviewId) => {
    if (helpfulVotes.has(reviewId)) {
      // Already voted, remove vote
      setHelpfulVotes(prev => {
        const newSet = new Set(prev)
        newSet.delete(reviewId)
        return newSet
      })
      setReviews(prev => prev.map(review =>
        review.id === reviewId
          ? { ...review, helpful: Math.max(0, review.helpful - 1) }
          : review
      ))
    } else {
      // New vote
      setHelpfulVotes(prev => new Set(prev).add(reviewId))
      setReviews(prev => prev.map(review =>
        review.id === reviewId
          ? { ...review, helpful: review.helpful + 1 }
          : review
      ))
    }
  }

  const handleReplyClick = (reviewId) => {
    setReplyStates(prev => ({
      ...prev,
      [reviewId]: !prev[reviewId]
    }))
  }

  const handleSubmitReply = (reviewId, replyText) => {
    if (!replyText.trim()) {
      alert("Please write a reply")
      return
    }

    const newReply = {
      id: Date.now(),
      userName: "You",
      userAvatar: `https://ui-avatars.com/api/?name=You&background=ffc107&color=fff&size=128`,
      comment: replyText,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
      verified: true
    }

    setReplies(prev => ({
      ...prev,
      [reviewId]: [...(prev[reviewId] || []), newReply]
    }))
    setReplyStates(prev => ({
      ...prev,
      [reviewId]: false
    }))
  }

  const renderStars = (rating, size = "h-4 w-4") => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`${size} ${i < Math.floor(rating)
          ? "fill-yellow-400 text-yellow-400"
          : i < rating
            ? "fill-yellow-200 text-yellow-200"
            : "fill-gray-300 text-gray-300"
          }`}
      />
    ))
  }

  if (loading) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a]">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Loading product...</h1>
        </div>
      </AnimatedPage>
    )
  }

  if (!product) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a]">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
          {error && (
            <p className="text-muted-foreground mb-4">
              {error}
            </p>
          )}
          <Link to="/user">
            <Button>Go Back Home</Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-orange-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12">

        {/* Hero Image Section */}
        <div className="relative w-full h-[350px] sm:h-[400px] md:h-[450px] lg:h-[500px] xl:h-[550px] overflow-hidden rounded-lg md:rounded-xl lg:rounded-2xl mt-4 md:mt-6 lg:mt-8">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover object-center" />

          {/* Back Button - Overlay on Image */}
          <div className="absolute top-4 left-4 z-10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/') )}
              className="rounded-full bg-white/90 backdrop-blur-sm hover:bg-white shadow-md"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>

          {/* Rating Badge - Top Right */}
          <div className="absolute top-4 right-4 z-10">
            <Badge className="bg-primary-orange text-white shadow-lg">
              <Star className="h-3 w-3 fill-white text-white mr-1" />
              {averageRating}
            </Badge>
          </div>

          {/* Product Info Card Overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-3xl p-4 sm:p-5 md:p-6 lg:p-8">
            <div className="flex items-start gap-4 md:gap-6 lg:gap-8">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 md:mb-3">
                  <div className={`w-4 h-4 md:w-5 md:h-5 border-2 ${product.isVeg ? 'border-green-600' : 'border-red-600'} flex items-center justify-center flex-shrink-0`}>
                    <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${product.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                  </div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight break-words">
                    {product.name}
                  </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base md:text-lg mb-2 md:mb-3 line-clamp-2 lg:line-clamp-3">
                  {product.description}
                </p>
                  <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                  <div className="flex items-center gap-1 md:gap-2">
                    {renderStars(averageRating, "h-4 w-4 md:h-5 md:w-5")}
                    <span className="text-gray-900 dark:text-white font-semibold text-sm sm:text-base md:text-lg">{averageRating}</span>
                  </div>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-600 dark:text-gray-300 text-sm sm:text-base md:text-lg underline">
                    {reviewsCount || 0} {(reviewsCount || 0) === 1 ? "Review" : "Reviews"}
                  </span>
                  <span className="text-gray-400">|</span>
                  <Badge variant="outline" className="text-xs sm:text-sm md:text-base">
                    {product.category}
                  </Badge>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-primary-orange">
                  ₹{product.price.toFixed(0)}
                </div>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">per serving</p>
              </div>
            </div>
          </div>
        </div>


        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 lg:py-12 space-y-6 md:space-y-8 lg:space-y-10">
          {/* Product Info */}
          <ScrollReveal>
            <div className="space-y-4">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground flex-wrap">
                <Link to="/user" className="hover:text-primary-orange transition-colors">Home</Link>
                <span>/</span>
                <span className="text-foreground font-medium truncate">{restaurant?.name || "Restaurant"}</span>
                <span>/</span>
                <span className="text-foreground font-medium truncate">{product.name}</span>
              </div>
            </div>
          </ScrollReveal>


          {/* Add to Cart */}
          <ScrollReveal delay={0.3}>
            <div className="space-y-4 pb-4 border-b">
              <h2 className="text-xl font-bold">Order</h2>
              {inCart ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 border border-[#EB590E] rounded-lg">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 hover:bg-[#FFF2EB]"
                      onClick={handleDecrease}
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <span className="px-4 text-lg font-semibold min-w-[2rem] text-center">
                      {cartItem?.quantity || 0}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 hover:bg-[#FFF2EB]"
                      onClick={handleIncrease}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">In cart</p>
                    <div className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-primary-orange">
                      ₹{(product.price * (cartItem?.quantity || 0)).toFixed(0)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 border border-gray-300 rounded-lg">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                    >
                      <Minus className="h-5 w-5" />
                    </Button>
                    <span className="px-4 text-lg font-semibold min-w-[2rem] text-center">
                      {quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => setQuantity(prev => prev + 1)}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div
                    className="flex-1"
                  >
                    <Button
                      onClick={handleAddToCart}
                      className="bg-primary-orange hover:opacity-90 text-white"
                    >
                      <span className="text-sm sm:text-base md:text-lg lg:text-xl font-bold">
                    Add to Cart - ₹{(product.price * quantity).toFixed(0)}
                  </span>  </Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollReveal>

          {/* Restaurant Info */}
          {restaurant && (
            <ScrollReveal delay={0.1}>
              <div className="space-y-3 md:space-y-4 pb-4 md:pb-6 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg md:text-xl lg:text-2xl font-bold">
                      {restaurant.name}
                    </h3>
                    <p className="text-sm md:text-base text-muted-foreground">{restaurant.cuisine}</p>
                  </div>
                  <Badge className="bg-primary-orange text-white text-sm md:text-base">{restaurant.priceRange}</Badge>
                </div>
                <div className="flex items-center gap-4 md:gap-6 flex-wrap text-sm md:text-base">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{restaurant.rating}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{restaurant.deliveryTime}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{restaurant.distance}</span>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* Product Details */}
          <ScrollReveal delay={0.2}>
            <div className="space-y-4 md:space-y-6 pb-4 md:pb-6 border-b">
              <h2 className="text-xl md:text-2xl lg:text-3xl font-bold">Details</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-sm md:text-base">
                <div>
                  <p className="text-muted-foreground mb-1 md:mb-2">Category</p>
                  <p className="font-semibold">{product.category}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 md:mb-2">Preparation Time</p>
                  <p className="font-semibold">{product.preparationTime}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 md:mb-2">Calories</p>
                  <p className="font-semibold">{product.calories} kcal</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 md:mb-2">Ingredients</p>
                  <p className="font-semibold">{product.ingredients.length} items</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-2 text-sm">Ingredients</p>
                <div className="flex flex-wrap gap-2">
                  {product.ingredients.map((ingredient, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {ingredient}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>


          {/* Order History */}
          {orderHistory.length > 0 && (
            <ScrollReveal delay={0.4}>
              <div className="space-y-4 pb-4 border-b">
                <h2 className="text-xl font-bold">Your Order History</h2>
                <div className="space-y-3">
                  {orderHistory.map((order) => (
                    <div key={order.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div>
                        <p className="font-semibold">Order {order.id}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>{order.status}</span>
                        </div>
                      </div>
                      <Badge variant="outline">{order.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          )}

          {/* <ScrollReveal delay={0.5}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Reviews</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'} • Average rating: {averageRating}
                  </p>
                </div>
                {!showReviewForm && (
                  <Button
                    onClick={() => setShowReviewForm(true)}
                    className="bg-primary-orange hover:opacity-90 text-white"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Write a Review
                  </Button>
                )}
              </div> */}

          {/* {showReviewForm && (
                <div className="space-y-4 pb-4 border-b">
                  <h3 className="text-lg font-semibold">Write Your Review</h3>
                  <form onSubmit={handleSubmitReview} className="space-y-4">
                    <div>
                      <Label>Your Rating</Label>
                      <div className="flex items-center gap-2 mt-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                          >
                            <Star
                              className={`h-6 w-6 ${star <= reviewForm.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "fill-gray-300 text-gray-300"}`} />
                          </button>
                        ))}
                        <span className="ml-2 text-sm text-muted-foreground">
                          {reviewForm.rating} out of 5
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="comment">Your Review</Label>
                      <Textarea
                        id="comment"
                        placeholder="Share your experience..."
                        className="mt-2 min-h-[120px]"
                        value={reviewForm.comment}
                        onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                        required />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowReviewForm(false)
                          setReviewForm({ rating: 5, comment: "" })
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-gradient-to-r bg-primary-orange hover:from-yellow-600 hover:to-orange-600"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Submit Review
                      </Button>
                    </div>
                  </form>
                </div>
              )} */}

          {/* <div className="space-y-4">
                {reviews.length > 0 ? (
                  reviews.map((review, index) => (
                    <ScrollReveal key={review.id} delay={index * 0.05}>
                      <div className="space-y-3 pb-4 border-b last:border-0">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
                            <img
                              src={review.userAvatar}
                              alt={review.userName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold">{review.userName}</h3>
                                  {review.verified && (
                                    <Badge className="bg-blue-500 text-white text-xs px-2 py-0">
                                      Verified
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    {renderStars(review.rating, "h-3 w-3")}
                                    <span className="ml-1 font-medium">{review.rating}</span>
                                  </div>
                                  <span>•</span>
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {review.date}
                                  </div>
                                  <span>•</span>
                                  <span>{review.orderType}</span>
                                </div>
                              </div>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">{review.comment}</p>
                            <div className="flex items-center gap-4 pt-2">
                              <button
                                onClick={() => handleHelpful(review.id)}
                                className={`flex items-center gap-2 text-sm transition-colors ${helpfulVotes.has(review.id)
                                    ? "text-primary-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                                  }`}
                              >
                                <ThumbsUp className={`h-4 w-4 ${helpfulVotes.has(review.id) ? "fill-primary-orange" : ""}`} />
                                <span>Helpful ({review.helpful})</span>
                              </button>
                              <button
                                onClick={() => handleReplyClick(review.id)}
                                className={`flex items-center gap-2 text-sm transition-colors ${replyStates[review.id]
                                    ? "text-primary-orange font-semibold"
                                    : "text-muted-foreground hover:text-foreground"
                                  }`}
                              >
                                <MessageCircle className="h-4 w-4" />
                                <span>Reply {replies[review.id]?.length > 0 && `(${replies[review.id].length})`}</span>
                              </button>
                            </div>

                            {replyStates[review.id] && (
                              <div className="mt-4 pt-4 border-t space-y-3">
                                <div className="flex items-start gap-3">
                                  <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0">
                                    <img
                                      src={`https://ui-avatars.com/api/?name=You&background=ffc107&color=fff&size=64`}
                                      alt="You"
                                      className="w-full h-full object-cover" />
                                  </div>
                                  <div className="flex-1 space-y-2">
                                    <Textarea
                                      placeholder="Write a reply..."
                                      className="min-h-[80px]"
                                      id={`reply-${review.id}`} />
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleReplyClick(review.id)}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="bg-primary-orange hover:opacity-90 text-white"
                                        onClick={() => {
                                          const textarea = document.getElementById(`reply-${review.id}`)
                                          if (textarea) {
                                            handleSubmitReply(review.id, textarea.value)
                                            textarea.value = ""
                                          }
                                        }}
                                      >
                                        <Send className="h-3 w-3 mr-2" />
                                        Post Reply
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {replies[review.id] && replies[review.id].length > 0 && (
                              <div className="mt-4 pt-4 border-t space-y-3">
                                {replies[review.id].map((reply) => (
                                  <div key={reply.id} className="flex items-start gap-3 pl-4 border-l-2 border-gray-200">
                                    <div className="h-8 w-8 rounded-full overflow-hidden flex-shrink-0">
                                      <img
                                        src={reply.userAvatar}
                                        alt={reply.userName}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">{reply.userName}</span>
                                        {reply.verified && (
                                          <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0">
                                            Verified
                                          </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">•</span>
                                        <span className="text-xs text-muted-foreground">{reply.date}</span>
                                      </div>
                                      <p className="text-sm text-muted-foreground leading-relaxed">{reply.comment}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </ScrollReveal>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No reviews yet. Be the first to review!</p>
                  </div>
                )}
              </div> */}
          {/* </div>
          </ScrollReveal> */}
        </div>
      </div>
      <Footer />
    </AnimatedPage>
  )
}


