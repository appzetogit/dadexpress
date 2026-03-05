import User from "../../auth/models/User.js";
import ReferralLog from "../../admin/models/ReferralLog.js";
import BusinessSettings from "../../admin/models/BusinessSettings.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

/**
 * Get User Referral Stats and Code
 * GET /api/user/referral/stats
 */
export const getUserReferralStats = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (!user) {
            return errorResponse(res, 404, "User not found");
        }

        // Generate referral code if doesn't exist
        if (!user.referralCode) {
            const namePrefix = user.name.split(' ')[0].toUpperCase().substring(0, 5);
            const randomPart = Math.floor(1000 + Math.random() * 9000);
            user.referralCode = namePrefix + randomPart;
            await user.save();
        }

        const settings = await BusinessSettings.getSettings();
        const referralSettings = settings?.referral || {
            isEnabled: true,
            referrerReward: 100,
            refereeReward: 50,
            minOrderValue: 199
        };

        return successResponse(res, 200, "Referral stats retrieved successfully", {
            referralCode: user.referralCode,
            referralStats: user.referralStats || {
                invited: 0,
                completed: 0,
                pending: 0,
                earned: 0
            },
            referralSettings: {
                isEnabled: referralSettings.isEnabled,
                referrerReward: referralSettings.referrerReward,
                refereeReward: referralSettings.refereeReward,
                minOrderValue: referralSettings.minOrderValue,
                maxRedemptionPercentage: referralSettings.maxRedemptionPercentage || 20,
                steps: ((referralSettings.steps && referralSettings.steps.length > 0) ? referralSettings.steps : [
                    { title: "Invite your friends", description: "Share your referral link or code with friends." },
                    { title: "Friend registers", description: "Your friend signs up using your referral code." },
                    { title: "They place first order", description: "Friend completes their first order of min ₹{minOrderValue}." },
                    { title: "You get rewards!", description: "{referrerReward} reward coins will be credited to your account." }
                ]).map(step => ({
                    title: step.title,
                    description: (step.description || "")
                        .replace('{minOrderValue}', referralSettings.minOrderValue || 199)
                        .replace('{referrerReward}', referralSettings.referrerReward || 100)
                        .replace('{refereeReward}', referralSettings.refereeReward || 50)
                }))
            }
        });
    } catch (error) {
        console.error("Error fetching referral stats:", error);
        return errorResponse(res, 500, "Failed to fetch referral stats");
    }
});

/**
 * Get Referral Logs for the User
 * GET /api/user/referral/logs
 */
export const getUserReferralLogs = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const logs = await ReferralLog.find({ referrer: userId })
            .populate("referee", "name createdAt")
            .sort({ createdAt: -1 });

        return successResponse(res, 200, "Referral logs retrieved successfully", logs);
    } catch (error) {
        console.error("Error fetching referral logs:", error);
        return errorResponse(res, 500, "Failed to fetch referral logs");
    }
});

/**
 * Get Platform-wide Referral Analytics (Admin only)
 * GET /api/admin/referral/analytics
 */
export const getReferralAnalytics = asyncHandler(async (req, res) => {
    try {
        const { days } = req.query;
        let matchStage = {};

        const groupByFormat = parseInt(days) === 7 ? "%a" : "%d %b";

        const areaStats = await ReferralLog.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$createdAt", timezone: "Asia/Kolkata" } },
                    referrals: { $sum: 1 },
                    conversions: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    sortDate: { $first: "$createdAt" }
                }
            },
            { $sort: { "sortDate": 1 } }
        ]);

        const stats = await ReferralLog.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "_id",
                    as: "orderData"
                }
            },
            {
                $unwind: {
                    path: "$orderData",
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    totalReferrerRewards: { $sum: "$referrerReward" },
                    totalRefereeRewards: { $sum: "$refereeReward" },
                    revenueGenerated: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, "$orderData.pricing.total", 0]
                        }
                    }
                }
            }
        ]);

        const UserWallet = (await import('../../user/models/UserWallet.js')).default;
        let txMatch = {};
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days));
            txMatch = { "transactions.createdAt": { $gte: date } };
        }

        const walletStats = await UserWallet.aggregate([
            { $unwind: "$transactions" },
            { $match: txMatch },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$transactions.createdAt", timezone: "Asia/Kolkata" } },
                    usage: { $sum: { $cond: [{ $eq: ["$transactions.type", "deduction"] }, "$transactions.amount", 0] } },
                    distribution: { $sum: { $cond: [{ $eq: ["$transactions.type", "addition"] }, "$transactions.amount", 0] } },
                    sortDate: { $first: "$transactions.createdAt" }
                }
            },
            { $sort: { "sortDate": 1 } }
        ]);

        const formattedStats = {
            total: 0,
            pending: 0,
            completed: 0,
            expired: 0,
            totalRewardsSpent: 0,
            revenueGenerated: 0,
            areaData: areaStats.map(item => ({
                name: item._id,
                referrals: item.referrals,
                conversions: item.conversions
            })),
            barData: walletStats.map(item => ({
                name: item._id,
                usage: item.usage,
                distribution: item.distribution
            }))
        };

        stats.forEach(s => {
            formattedStats.total += s.count;
            if (s._id === 'pending') formattedStats.pending = s.count;
            if (s._id === 'completed') formattedStats.completed = s.count;
            if (s._id === 'expired') formattedStats.expired = s.count;
            formattedStats.totalRewardsSpent += (s.totalReferrerRewards + s.totalRefereeRewards);
            formattedStats.revenueGenerated += (s.revenueGenerated || 0);
        });

        return successResponse(res, 200, "Referral analytics retrieved successfully", formattedStats);
    } catch (error) {
        console.error("Error fetching referral analytics:", error);
        return errorResponse(res, 500, "Failed to fetch referral analytics");
    }
});

/**
 * Get All Referral Users/Logs (Admin only)
 * GET /api/admin/referral/users
 */
export const getReferralUsers = asyncHandler(async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const query = status ? { status } : {};

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await ReferralLog.find(query)
            .populate("referrer", "name email phone")
            .populate("referee", "name email phone")
            .populate("orderId", "orderId total")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalLogs = await ReferralLog.countDocuments(query);

        return successResponse(res, 200, "Referral users retrieved successfully", {
            logs,
            pagination: {
                total: totalLogs,
                page: parseInt(page),
                pages: Math.ceil(totalLogs / limit) || 1
            }
        });
    } catch (error) {
        console.error("Error fetching referral users:", error);
        return errorResponse(res, 500, "Failed to fetch referral users");
    }
});

/**
 * Get Manual Adjustments (Admin only)
 * GET /api/admin/referral/adjustments
 */
export const getManualAdjustments = asyncHandler(async (req, res) => {
    try {
        // Find recent transactions with 'adjustment' type across all wallets
        const UserWallet = (await import('../../user/models/UserWallet.js')).default;

        const wallets = await UserWallet.find({
            "transactions.description": { $regex: /Manual/i }
        }).populate("userId", "name email");

        let history = [];
        wallets.forEach(wallet => {
            const tempStrId = wallet.userId ? wallet.userId.name : "Unknown User";
            const adjustments = wallet.transactions.filter(t => t.description && t.description.toLowerCase().includes('manual'));
            adjustments.forEach(t => {
                history.push({
                    id: t._id,
                    user: tempStrId,
                    action: t.type === 'addition' ? 'Credit' : 'Debit',
                    coins: t.amount,
                    reason: t.description,
                    createdAt: t.createdAt,
                    date: new Date(t.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                });
            });
        });

        // Sort by most recent
        history.sort((a, b) => b.createdAt - a.createdAt);
        // limit to 20
        history = history.slice(0, 20);

        return successResponse(res, 200, "Adjustments retrieved successfully", history);
    } catch (error) {
        console.error("Error fetching manual adjustments:", error);
        return errorResponse(res, 500, "Failed to fetch manual adjustments");
    }
});

/**
 * Add Manual Adjustment (Admin only)
 * POST /api/admin/referral/adjustments
 */
export const addManualAdjustment = asyncHandler(async (req, res) => {
    try {
        const { userSearch, action, coins, note } = req.body;

        if (!userSearch || !coins || !action) {
            return errorResponse(res, 400, "Missing required fields");
        }

        const amount = Number(coins);
        if (isNaN(amount) || amount <= 0) {
            return errorResponse(res, 400, "Invalid coin amount");
        }

        // Find user by email or name
        let query = {};
        if (userSearch.includes('@')) {
            query.email = { $regex: new RegExp(`^${userSearch}$`, "i") };
        } else {
            query.name = { $regex: new RegExp(userSearch, "i") };
        }

        const user = await User.findOne(query);
        if (!user) {
            return errorResponse(res, 404, "User not found with this email or name");
        }

        const UserWallet = (await import('../../user/models/UserWallet.js')).default;
        const wallet = await UserWallet.findOrCreateByUserId(user._id);

        const transactionType = action === 'add' ? 'addition' : 'deduction';
        const adjustNote = note ? `Manual ${action === 'add' ? 'Addition' : 'Deduction'} - ${note}` : `Manual ${action === 'add' ? 'Addition' : 'Deduction'}`;

        await wallet.addTransaction({
            amount,
            type: transactionType,
            status: 'Completed',
            description: adjustNote
        });

        await wallet.save();

        return successResponse(res, 200, "Coins adjusted successfully", null);
    } catch (error) {
        console.error("Error adjusting coins manually:", error);
        if (error.message === 'Insufficient wallet balance') {
            return errorResponse(res, 400, "Insufficient wallet balance for this deduction");
        }
        return errorResponse(res, 500, "Failed to adjust coins");
    }
});
