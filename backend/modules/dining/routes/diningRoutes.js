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
  verifyBookingPayment,
  getSlotAvailability,
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
import DiningRestaurant from "../models/DiningRestaurant.js";

const router = express.Router();

router.get("/restaurants", getRestaurants);
router.get("/restaurants/:slug", getRestaurantBySlug);
router.get("/categories", getCategories);
router.get("/limelight", getLimelight);
router.get("/bank-offers", getBankOffers);
router.get("/must-tries", getMustTries);
router.get("/offer-banners", getOfferBanners);
router.get("/stories", getStories);

// TEMP: Fix coordinate-based locations to proper address names
router.get("/admin/fix-locations", async (req, res) => {
  try {
    const coordsRegex = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
    const all = await DiningRestaurant.find({});
    let fixed = 0;
    for (const r of all) {
      if (typeof r.location === "string" && coordsRegex.test(r.location.trim())) {
        r.location = r.name + " - India";
        await r.save();
        fixed++;
        console.log(`Fixed: ${r.name} -> ${r.location}`);
      }
    }
    res.json({ success: true, fixed, message: `Fixed ${fixed} restaurants` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Slot Availability (public)
router.get("/slot-availability", getSlotAvailability);

// Booking Routes
router.post("/bookings", authenticateUser, createBooking);
router.post("/bookings/verify-payment", authenticateUser, verifyBookingPayment);
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
