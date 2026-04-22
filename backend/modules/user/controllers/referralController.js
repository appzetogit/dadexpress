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
        const daysInt = Number.parseInt(days, 10) || 7;

        // Build date filters
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysInt);
        fromDate.setHours(0, 0, 0, 0); // Start of the day

        const matchStage = { createdAt: { $gte: fromDate } };
        const txMatch = { "transactions.createdAt": { $gte: fromDate } };

        const groupByFormat = "%Y-%m-%d";

        // 1. All-time stats (for boxes)
        const totalAllTime = await ReferralLog.countDocuments();
        
        const allTimeStats = await ReferralLog.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "orderId",
                    foreignField: "_id",
                    as: "orderData"
                }
            },
            { $unwind: { path: "$orderData", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    revenue: {
                        $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$orderData.pricing.total", 0] }
                    }
                }
            }
        ]);

        let completedAllTime = 0;
        let revenueAllTime = 0;
        allTimeStats.forEach(s => {
            if (s._id === 'completed') {
                completedAllTime = s.count;
                revenueAllTime = s.revenue;
            }
        });

        // 2. Period-specific stats (for charts and recent metrics)
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

        const UserWallet = (await import('../../user/models/UserWallet.js')).default;
        const walletStats = await UserWallet.aggregate([
            { $unwind: "$transactions" },
            { 
                $match: {
                    ...txMatch,
                    "transactions.type": "addition",
                    "transactions.status": "Completed",
                    "transactions.description": { $regex: /Referral|Joining/i }
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$transactions.createdAt", timezone: "Asia/Kolkata" } },
                    distribution: { $sum: "$transactions.amount" },
                    sortDate: { $first: "$transactions.createdAt" }
                }
            },
            { $sort: { "sortDate": 1 } }
        ]);

        // Also get usage (deductions) for the bar chart
        const usageStats = await UserWallet.aggregate([
            { $unwind: "$transactions" },
            { 
                $match: {
                    ...txMatch,
                    "transactions.type": "deduction",
                    "transactions.status": "Completed"
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: groupByFormat, date: "$transactions.createdAt", timezone: "Asia/Kolkata" } },
                    usage: { $sum: "$transactions.amount" },
                    sortDate: { $first: "$transactions.createdAt" }
                }
            },
            { $sort: { "sortDate": 1 } }
        ]);

        // Calculate total rewards issued in period
        const rangeRewardsSpent = walletStats.reduce((sum, item) => sum + (item.distribution || 0), 0);

        // 3. Zero-filling for charts
        const areaDataMap = new Map(areaStats.map(i => [i._id, i]));
        const barDataMap = new Map();
        
        walletStats.forEach(i => {
            const existing = barDataMap.get(i._id) || { distribution: 0, usage: 0 };
            barDataMap.set(i._id, { ...existing, distribution: i.distribution });
        });
        usageStats.forEach(i => {
            const existing = barDataMap.get(i._id) || { distribution: 0, usage: 0 };
            barDataMap.set(i._id, { ...existing, usage: i.usage });
        });

        const finalAreaData = [];
        const finalBarData = [];
        
        for (let i = daysInt - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            
            // Format matching the aggregation's format (YYYY-MM-DD)
            const key = d.toISOString().split('T')[0];

            // Display label for the chart
            const label = daysInt === 7 
                ? d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })
                : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });

            const areaItem = areaDataMap.get(key) || { referrals: 0, conversions: 0 };
            finalAreaData.push({
                name: label,
                referrals: areaItem.referrals,
                conversions: areaItem.conversions
            });

            const barItem = barDataMap.get(key) || { distribution: 0, usage: 0 };
            finalBarData.push({
                name: label,
                distribution: barItem.distribution,
                usage: barItem.usage
            });
        }

        const formattedStats = {
            total: totalAllTime,
            completed: completedAllTime,
            totalRewardsSpent: rangeRewardsSpent,
            revenueGenerated: revenueAllTime,
            areaData: finalAreaData,
            barData: finalBarData
        };

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

        // Sync legacy User model balance to ensure coins are usable in checkout
        await User.findByIdAndUpdate(user._id, {
            $inc: { 'wallet.balance': action === 'add' ? amount : -amount }
        });

        return successResponse(res, 200, "Coins adjusted successfully", null);
    } catch (error) {
        console.error("Error adjusting coins manually:", error);
        if (error.message === 'Insufficient wallet balance') {
            return errorResponse(res, 400, "Insufficient wallet balance for this deduction");
        }
        return errorResponse(res, 500, "Failed to adjust coins");
    }
});
