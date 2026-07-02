import express from "express";
import {
  getRestaurants,
  getRestaurantBySlug,
  getCategories,
  getLimelight,
  getBankOffers,
  getMustTries,
  getOfferBanners,
  getStories,
  createBooking,
  getUserBookings,
  getRestaurantBookings,
  updateBookingStatus,
  createDiningReview,
  initiateDiningBillPayment,
  verifyDiningBillPayment,
  getUserDiningBills,
  deleteDiningBill
} from "../controllers/diningController.js";
import { authenticate as authenticateUser } from "../../auth/middleware/auth.js";
import { authenticate as authenticateRestaurant } from "../../restaurant/middleware/restaurantAuth.js";

const router = express.Router();

router.get("/restaurants", getRestaurants);
router.get("/restaurants/:slug", getRestaurantBySlug);
router.get("/categories", getCategories);
router.get("/limelight", getLimelight);
router.get("/bank-offers", getBankOffers);
router.get("/must-tries", getMustTries);
router.get("/offer-banners", getOfferBanners);
router.get("/stories", getStories);

// Booking Routes
router.post("/bookings", authenticateUser, createBooking);
router.get("/bookings/my", authenticateUser, getUserBookings);
router.get(
  "/bookings/restaurant/:restaurantId",
  authenticateRestaurant,
  getRestaurantBookings,
);
router.patch(
  "/bookings/:bookingId/status",
  authenticateUser,
  updateBookingStatus,
);
router.patch(
  "/bookings/:bookingId/status/restaurant",
  authenticateRestaurant,
  updateBookingStatus,
);
router.post("/reviews", authenticateUser, createDiningReview);

// Pay Bill Routes
router.post("/bill/initiate", authenticateUser, initiateDiningBillPayment);
router.post("/bill/verify", authenticateUser, verifyDiningBillPayment);
router.get("/bill/my", authenticateUser, getUserDiningBills);
router.delete("/bill/:id", authenticateUser, deleteDiningBill);

export default router;
