import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { successResponse } from "../../../shared/utils/response.js";
import BusinessSettings from "../../admin/models/BusinessSettings.js";

/**
 * Get Delivery Partner Referral Stats and Code
 * GET /api/delivery/referral/stats
 *
 * Note: For now we keep it simple and backend-agnostic:
 * - Uses global referral settings from BusinessSettings (same as user referrals)
 * - Tracks basic counters per delivery partner in-memory shape to match frontend needs
 * - Can be safely extended later without breaking the current response contract.
 */
export const getDeliveryReferralStats = asyncHandler(async (req, res) => {
  // req.delivery is attached by deliveryAuth.authenticate middleware
  const delivery = req.delivery;

  // Generate a simple referral code for delivery partner based on deliveryId / phone
  const baseCode =
    (delivery.deliveryId || "")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase() ||
    (delivery.phone || "")
      .slice(-6)
      .replace(/[^0-9]/g, "");

  const referralCode = `DEL-${baseCode || "PARTNER"}`;

  // Load global referral settings (reuse existing BusinessSettings referral config)
  const settings = await BusinessSettings.getSettings();
  const referralSettings = settings?.referral || {
    isEnabled: true,
    referrerReward: 100,
    refereeReward: 50,
    minOrderValue: 199,
  };

  // For now, delivery partner specific stats are kept zeroed –
  // frontend only needs a consistent shape and reward amounts.
  const referralStats = {
    invited: 0,
    completed: 0,
    pending: 0,
    earned: 0,
  };

  return successResponse(
    res,
    200,
    "Delivery referral stats retrieved successfully",
    {
      referralCode,
      referralStats,
      referralSettings: {
        isEnabled: referralSettings.isEnabled,
        referrerReward: referralSettings.referrerReward,
        refereeReward: referralSettings.refereeReward,
        minOrderValue: referralSettings.minOrderValue,
        maxRedemptionPercentage: referralSettings.maxRedemptionPercentage || 20,
      },
    }
  );
});


