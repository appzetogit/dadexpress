import express from "express";
import { authenticate } from "../middleware/deliveryAuth.js";
import { getDeliveryReferralStats } from "../controllers/deliveryReferralController.js";

const router = express.Router();

// All delivery referral routes require delivery authentication
router.use(authenticate);

// Get delivery partner referral stats and current code
router.get("/referral/stats", getDeliveryReferralStats);

export default router;


