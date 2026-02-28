import express from "express";
import { getUserReferralStats, getUserReferralLogs } from "../controllers/referralController.js";
import { authenticate } from "../../auth/middleware/auth.js";

const router = express.Router();

// Get user referral stats and current code
router.get("/stats", authenticate, getUserReferralStats);
// Get referral logs (invites status)
router.get("/logs", authenticate, getUserReferralLogs);

export default router;
