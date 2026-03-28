import Admin from "../models/Admin.js";
import Order from "../../order/models/Order.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import Delivery from "../../delivery/models/Delivery.js";
import DeliveryWallet from "../../delivery/models/DeliveryWallet.js";
import Offer from "../../restaurant/models/Offer.js";
import Menu from "../../restaurant/models/Menu.js";
import AdminCommission from "../models/AdminCommission.js";
import OrderSettlement from "../../order/models/OrderSettlement.js";
import AdminWallet from "../models/AdminWallet.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { normalizePhoneNumber } from "../../../shared/utils/phoneUtils.js";
import winston from "winston";
import mongoose from "mongoose";
import { uploadToCloudinary } from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const toValidDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isBetweenDates = (value, start, end) => {
  const date = toValidDate(value);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
};

const getDashboardOrderEventDate = (order) => {
  switch (order?.status) {
    case "confirmed":
      return order?.tracking?.confirmed?.timestamp || order?.createdAt || null;
    case "preparing":
      return order?.tracking?.preparing?.timestamp || order?.tracking?.confirmed?.timestamp || order?.createdAt || null;
    case "ready":
      return order?.tracking?.ready?.timestamp || order?.tracking?.preparing?.timestamp || order?.createdAt || null;
    case "out_for_delivery":
      return order?.tracking?.outForDelivery?.timestamp || order?.tracking?.ready?.timestamp || order?.createdAt || null;
    case "delivered":
      return order?.deliveredAt || order?.tracking?.delivered?.timestamp || order?.createdAt || null;
    case "cancelled":
      return order?.cancelledAt || order?.createdAt || null;
    case "pending":
    default:
      return order?.createdAt || null;
  }
};

const getDashboardChartBuckets = (period, now) => {
  if (period === "today") {
    return Array.from({ length: 12 }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), index * 2, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), index * 2 + 1, 59, 59, 999);
      const labelHour = start.getHours().toString().padStart(2, "0");
      return { label: `${labelHour}:00`, start, end };
    });
  }

  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index), 23, 59, 59, 999);
      return {
        label: start.toLocaleDateString("en-US", { weekday: "short" }),
        start,
        end,
      };
    });
  }

  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const start = new Date(now.getFullYear(), now.getMonth(), index + 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), index + 1, 23, 59, 59, 999);
      return {
        label: `${index + 1}`,
        start,
        end,
      };
    });
  }

  const monthCount = period === "year" ? 12 : 12;
  return Array.from({ length: monthCount }, (_, index) => {
    const monthOffset = monthCount - 1 - index;
    const start = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() - monthOffset + 1, 0, 23, 59, 59, 999);
    return {
      label: start.toLocaleDateString("en-US", { month: "short" }),
      start,
      end,
    };
  });
};

/**
 * Get Admin Dashboard Statistics
 * GET /api/admin/dashboard/stats
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const { period, zone } = req.query;
    const now = new Date();

    // Create a robust zone filter for both string and ObjectId matches (in case type varies in DB)
    const getZoneFilter = (z) => {
      if (!z || z === "all") return null;
      if (mongoose.Types.ObjectId.isValid(z)) {
        return { $in: [z, new mongoose.Types.ObjectId(z)] };
      }
      return z;
    };
    const zoneMatcher = getZoneFilter(zone);

    // Calculate date range based on period filter
    let periodStart = null;
    if (period === "today") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "year") {
      periodStart = new Date(now.getFullYear(), 0, 1);
    }

    // Base order match - filter by period and zone if specified
    const baseOrderMatch = { status: "delivered", "pricing.total": { $exists: true } };
    if (periodStart) baseOrderMatch.deliveredAt = { $gte: periodStart, $lte: now };
    if (zoneMatcher) baseOrderMatch["assignmentInfo.zoneId"] = zoneMatcher;

    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const existingDeliveryPartnerIds = await Delivery.find({})
      .distinct("_id")
      .catch(() => []);

    const getDeliveryEarningFromWallets = async (startDate = null, endDate = null) => {
      const pipeline = [
        {
          $match: {
            ...(Array.isArray(existingDeliveryPartnerIds) &&
            existingDeliveryPartnerIds.length > 0
              ? { deliveryId: { $in: existingDeliveryPartnerIds } }
              : {}),
          },
        },
        { $unwind: "$transactions" },
        {
          $addFields: {
            effectiveTransactionDate: {
              $ifNull: ["$transactions.createdAt", "$transactions.processedAt"],
            },
          },
        },
        {
          $match: {
            "transactions.type": "payment",
            "transactions.status": "Completed",
            ...(startDate
              ? {
                  effectiveTransactionDate: {
                    $gte: startDate,
                    $lte: endDate || now,
                  },
                }
              : {}),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$transactions.amount", 0] } },
          },
        },
      ];

      const result = await DeliveryWallet.aggregate(pipeline);
      return Number(result?.[0]?.total || 0);
    };

    // Get total revenue (sum of all completed orders filtered by period)
    const revenueStats = await Order.aggregate([
      {
        $match: baseOrderMatch,
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$pricing.total" },
          totalTax: { $sum: "$pricing.tax" },
          last30DaysRevenue: {
            $sum: {
              $cond: [
                { $gte: ["$createdAt", last30Days] },
                "$pricing.total",
                0,
              ],
            },
          },
          last30DaysTax: {
            $sum: {
              $cond: [
                { $gte: ["$createdAt", last30Days] },
                "$pricing.tax",
                0,
              ],
            },
          },
        },
      },
    ]);

    // Get revenue data from aggregation result
    const revenueData = revenueStats[0] || {
      totalRevenue: 0,
      totalTax: 0,
      last30DaysRevenue: 0,
      last30DaysTax: 0
    };

    // Get all settlements for delivered orders filtered by period and zone
    const deliveredOrderQuery = { status: "delivered" };
    if (periodStart) deliveredOrderQuery.deliveredAt = { $gte: periodStart, $lte: now };
    if (zoneMatcher) deliveredOrderQuery["assignmentInfo.zoneId"] = zoneMatcher;
    
    const deliveredOrderIds = await Order.find(deliveredOrderQuery)
      .select("_id")
      .lean();
    const deliveredOrderIdArray = deliveredOrderIds.map((o) => o._id);

    // Get settlements only for delivered orders
    const allSettlements = await OrderSettlement.find({
      orderId: { $in: deliveredOrderIdArray },
    }).lean();

    console.log(
      `ðŸ“Š Dashboard Stats - Total settlements found: ${allSettlements.length}`,
    );

    // Debug: Log first settlement to see actual structure
    if (allSettlements.length > 0) {
      const firstSettlement = allSettlements[0];
      console.log("ðŸ” First settlement sample:", {
        orderNumber: firstSettlement.orderNumber,
        adminEarning: firstSettlement.adminEarning,
        userPayment: firstSettlement.userPayment,
      });
    }

    // Calculate totals from all settlements - use adminEarning fields
    let totalCommission = 0;
    let totalPlatformFee = 0;
    let totalDeliveryFee = 0;
    let totalGST = 0;
    let totalDeliveryEarning = 0;

    allSettlements.forEach((s, index) => {
      const commission = s.adminEarning?.commission || 0;
      const platformFee = s.adminEarning?.platformFee || 0;
      const deliveryFee = s.adminEarning?.deliveryFee || 0;
      // Some historical settlements may miss adminEarning.gst, so fallback to userPayment.gst.
      const gst = Number(s.adminEarning?.gst ?? s.userPayment?.gst ?? 0);
      const deliveryEarning = Number(s.deliveryPartnerEarning?.totalEarning || 0);

      totalCommission += commission;
      totalPlatformFee += platformFee;
      totalDeliveryFee += deliveryFee;
      totalGST += gst;
      totalDeliveryEarning += deliveryEarning;

      // Log each settlement for debugging
      if (index < 5) {
        // Log first 5 settlements
        console.log(
          `ðŸ“¦ Settlement ${index + 1} (${s.orderNumber}): Commission: â‚¹${commission}, Platform: â‚¹${platformFee}, Delivery: â‚¹${deliveryFee}, GST: â‚¹${gst}`,
        );
      }
    });

    totalCommission = Math.round(totalCommission * 100) / 100;
    totalPlatformFee = Math.round(totalPlatformFee * 100) / 100;
    totalDeliveryFee = Math.round(totalDeliveryFee * 100) / 100;
    // Use tax from Order model as primary source of truth for GST to match Gross Revenue consistency
    totalGST = Math.round((revenueData.totalTax || 0) * 100) / 100;
    totalDeliveryEarning = Math.round(
      (await getDeliveryEarningFromWallets(periodStart, now)) * 100,
    ) / 100;

    console.log(
      `ðŸ’° Final calculated totals - Commission: â‚¹${totalCommission}, Platform Fee: â‚¹${totalPlatformFee}, Delivery Fee: â‚¹${totalDeliveryFee}, GST: â‚¹${totalGST}`,
    );

    // Get last 30 days data from OrderSettlement
    const last30DaysOrderQuery = {
      status: "delivered",
      deliveredAt: { $gte: last30Days, $lte: now }
    };
    if (zoneMatcher) last30DaysOrderQuery["assignmentInfo.zoneId"] = zoneMatcher;
    
    const last30DaysOrderIds = await Order.find(last30DaysOrderQuery).select("_id").lean();
    const last30DaysOrderIdArray = last30DaysOrderIds.map(o => o._id);

    const last30DaysSettlements = await OrderSettlement.find({
      orderId: { $in: last30DaysOrderIdArray }
    }).lean();
    const last30DaysCommission = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.commission || 0),
      0,
    );
    const last30DaysPlatformFee = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.platformFee || 0),
      0,
    );
    const last30DaysDeliveryFee = last30DaysSettlements.reduce(
      (sum, s) => sum + (s.adminEarning?.deliveryFee || 0),
      0,
    );
    const last30DaysGST = last30DaysSettlements.reduce(
      (sum, s) => sum + Number(s.adminEarning?.gst ?? s.userPayment?.gst ?? 0),
      0,
    );
    const last30DaysDeliveryEarning = await getDeliveryEarningFromWallets(
      last30Days,
      now,
    );

    // Get order statistics aligned with the selected period using each status event timestamp.
    const orderFlowQuery = {
      $and: [
        periodStart ? {
          $or: [
            { createdAt: { $gte: periodStart, $lte: now } },
            { deliveredAt: { $gte: periodStart, $lte: now } },
            { cancelledAt: { $gte: periodStart, $lte: now } },
            { "tracking.confirmed.timestamp": { $gte: periodStart, $lte: now } },
            { "tracking.preparing.timestamp": { $gte: periodStart, $lte: now } },
            { "tracking.ready.timestamp": { $gte: periodStart, $lte: now } },
            { "tracking.outForDelivery.timestamp": { $gte: periodStart, $lte: now } },
            { "tracking.delivered.timestamp": { $gte: periodStart, $lte: now } },
          ],
        } : {},
        zoneMatcher ? { "assignmentInfo.zoneId": zoneMatcher } : {}
      ]
    };

    const orderFlowCandidates = await Order.find(orderFlowQuery)
      .select("status createdAt deliveredAt cancelledAt tracking")
      .lean();

    const filteredOrderFlowOrders = periodStart
      ? orderFlowCandidates.filter((order) =>
          isBetweenDates(getDashboardOrderEventDate(order), periodStart, now),
        )
      : orderFlowCandidates;

    const orderStatusMap = filteredOrderFlowOrders.reduce((acc, order) => {
      const key = order?.status || "pending";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // Get total orders processed (delivered) filtered by period
    const totalOrders = orderStatusMap.delivered || 0;

    // Get active partners count
    // Shared scope for dashboard list parity:
    // filter by zone if specified (not possible directly on Restaurant, using orders found in zone)
    let restaurantMatch = { isActive: true };
    if (zoneMatcher) {
      // Find restaurants that have at least one order in this zone
      const restaurantIdsInZone = await Order.distinct("restaurantId", { "assignmentInfo.zoneId": zoneMatcher });
      // Also check restaurants that are associated with the zone in Zone model?
      const ZoneModel = (await import("../models/Zone.js")).default;
      const zones = await ZoneModel.find({ _id: zoneMatcher }).select("restaurantId").lean();
      const directRestaurantId = zones[0]?.restaurantId;
      
      const combinedRestaurantIds = [...new Set([...restaurantIdsInZone, directRestaurantId].filter(id => id))];
      
      const validObjectIds = combinedRestaurantIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      const validStringIds = combinedRestaurantIds.filter(id => typeof id === 'string' && !mongoose.Types.ObjectId.isValid(id));

      restaurantMatch.$or = [
        { _id: { $in: validObjectIds } },
        { restaurantId: { $in: validStringIds } }
      ];
    }

    const activeRestaurantsDocs = await Restaurant.find(restaurantMatch)
      .select("_id restaurantId")
      .lean();
    
    // Update total restaurants count and active partners count based on filtered restaurants
    const totalRestaurants = activeRestaurantsDocs.length;
    const activeRestaurantsCount = activeRestaurantsDocs.length;
    
    // Note: Delivery partners are stored in User model
    const User = (await import("../../auth/models/User.js")).default;
    // For now, only filter restaurants by zone as delivery boys move across zones
    const activeDeliveryPartners = await User.countDocuments({
      role: "delivery",
      isActive: true,
    });
    const activePartners = activeRestaurantsCount + activeDeliveryPartners;

    // Restaurant requests pending (inactive restaurants with completed onboarding, no rejection)
    const pendingRestaurantRequestsQuery = {
      $and: [
        { "onboarding.completedSteps": { $gte: 4 } },
        {
          $or: [{ approvedAt: { $exists: false } }, { approvedAt: null }],
        },
        {
          $or: [
            { rejectionReason: { $exists: false } },
            { rejectionReason: null },
            { rejectionReason: "" },
          ],
        },
      ],
    };
    const pendingRestaurantRequests = await Restaurant.countDocuments(
      pendingRestaurantRequestsQuery,
    );

    // Total delivery boys should match Deliveryman List criteria.
    // Deliveryman List shows partners with status in ['approved', 'active'].
    const totalDeliveryBoys = await Delivery.countDocuments({
      status: { $in: ["approved", "active"] },
    });

    // Delivery boy pending requests should match join-request screen criteria.
    // Admin join requests are sourced from Delivery model with status='pending'.
    const pendingDeliveryBoyRequests = await Delivery.countDocuments({
      status: "pending",
    });

    const activeRestaurantObjectIds = activeRestaurantsDocs.map(r => r._id);

    // Total foods (Menu items) - Count all individual menu items from active restaurant menus
    // Count ALL items (including disabled sections, unavailable items, pending/approved, excluding only rejected)
    const Menu = (await import("../../restaurant/models/Menu.js")).default;
    // Get all active menus and count items in sections and subsections
    const activeMenus = await Menu.find({
      isActive: true,
      restaurant: { $in: activeRestaurantObjectIds },
    })
      .select("sections")
      .lean();
    let totalFoods = 0;
    activeMenus.forEach((menu) => {
      if (menu.sections && Array.isArray(menu.sections)) {
        menu.sections.forEach((section) => {
          // Count items from ALL sections (enabled and disabled)

          // Count items directly in section (same as admin food list total view)
          if (section.items && Array.isArray(section.items)) {
            totalFoods += section.items.filter((item) => {
              // Must have required fields
              if (!item || !item.id || !item.name) return false;
              // Count all items regardless of availability/approval status for dashboard list parity
              return true;
            }).length;
          }
          // Count items in subsections (same as admin food list total view)
          if (section.subsections && Array.isArray(section.subsections)) {
            section.subsections.forEach((subsection) => {
              if (subsection.items && Array.isArray(subsection.items)) {
                totalFoods += subsection.items.filter((item) => {
                  // Must have required fields
                  if (!item || !item.id || !item.name) return false;
                  // Count all items regardless of availability/approval status for dashboard list parity
                  return true;
                }).length;
              }
            });
          }
        });
      }
    });

    // Total addons - align with /admin/addons list scope
    // (active restaurants only, then count addons from their active menus)
    let totalAddons = 0;
    const menusWithAddons = await Menu.find({
      isActive: true,
      restaurant: { $in: activeRestaurantObjectIds },
    })
      .select("addons")
      .lean();
    menusWithAddons.forEach((menu) => {
      // Only process if menu has addons array and it's not empty
      if (
        !menu.addons ||
        !Array.isArray(menu.addons) ||
        menu.addons.length === 0
      ) {
        return;
      }

      totalAddons += menu.addons.filter((addon) => {
        // Only count if addon exists and has required fields (id and name are mandatory)
        if (!addon || typeof addon !== "object") return false;
        if (!addon.id || typeof addon.id !== "string" || addon.id.trim() === "")
          return false;
        if (
          !addon.name ||
          typeof addon.name !== "string" ||
          addon.name.trim() === ""
        )
          return false;
        // Exclude only rejected addons (include all others: pending, approved, available, unavailable)
        if (addon.approvalStatus === "rejected") return false;
        // Count all other addons regardless of availability or approval status
        return true;
      }).length;
    });

    // Total customers (users with role 'user' or no role specified)
    const totalCustomers = await User.countDocuments({
      $or: [{ role: "user" }, { role: { $exists: false } }, { role: null }],
    });

    // Keep dashboard "Pending orders" aligned with /admin/orders/pending list.
    // Use a global count to ensure all orders awaiting processing are visible regardless of period.
    const pendingOrdersQuery = { status: "pending" };
    if (zoneMatcher) pendingOrdersQuery["assignmentInfo.zoneId"] = zoneMatcher;
    const pendingOrders = await Order.countDocuments(pendingOrdersQuery);

    // Completed orders (delivered orders)
    const completedOrders = orderStatusMap.delivered || 0;

    // Get recent activity (last 24 hours)
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentOrders = await Order.countDocuments({
      createdAt: { $gte: last24Hours },
    });
    const recentRestaurants = await Restaurant.countDocuments({
      createdAt: { $gte: last24Hours },
      isActive: true,
    });

    // Build period-aware cash-flow chart data.
    const chartBuckets = getDashboardChartBuckets(period, now);
    const chartRangeStart = chartBuckets[0]?.start || new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const chartRangeEnd = chartBuckets[chartBuckets.length - 1]?.end || now;
    
    const chartOrderQuery = {
      status: "delivered",
      deliveredAt: { $gte: chartRangeStart, $lte: chartRangeEnd },
    };
    if (zoneMatcher) chartOrderQuery["assignmentInfo.zoneId"] = zoneMatcher;

    const chartOrders = await Order.find(chartOrderQuery)
      .select("_id pricing deliveredAt tracking createdAt")
      .lean();

    const chartOrderIds = chartOrders.map((order) => order._id);
    const chartSettlements = await OrderSettlement.find({
      orderId: { $in: chartOrderIds },
    })
      .select("orderId adminEarning")
      .lean();

    const chartSettlementMap = new Map();
    chartSettlements.forEach((settlement) => {
      chartSettlementMap.set(String(settlement.orderId), settlement);
    });

    const monthlyData = chartBuckets.map((bucket) => {
      let bucketRevenue = 0;
      let bucketCommission = 0;
      let bucketOrders = 0;

      chartOrders.forEach((order) => {
        const deliveredDate =
          order?.deliveredAt || order?.tracking?.delivered?.timestamp || order?.createdAt;
        if (!isBetweenDates(deliveredDate, bucket.start, bucket.end)) {
          return;
        }

        bucketOrders += 1;
        bucketRevenue += Number(order?.pricing?.total) || 0;

        const settlement = chartSettlementMap.get(String(order._id));
        if (settlement?.adminEarning) {
          bucketCommission += Number(settlement.adminEarning.commission) || 0;
        }
      });

      return {
        month: bucket.label,
        revenue: Math.round(bucketRevenue * 100) / 100,
        commission: Math.round(bucketCommission * 100) / 100,
        orders: bucketOrders,
      };
    });

    return successResponse(res, 200, "Dashboard stats retrieved successfully", {
      revenue: {
        total: revenueData.totalRevenue || 0,
        last30Days: revenueData.last30DaysRevenue || 0,
        currency: "INR",
      },
      commission: {
        total: totalCommission,
        last30Days: last30DaysCommission,
        currency: "INR",
      },
      platformFee: {
        total: totalPlatformFee,
        last30Days: last30DaysPlatformFee,
        currency: "INR",
      },
      deliveryFee: {
        total: totalDeliveryFee,
        last30Days: last30DaysDeliveryFee,
        currency: "INR",
      },
      deliveryEarning: {
        total: totalDeliveryEarning,
        last30Days: Math.round(last30DaysDeliveryEarning * 100) / 100,
        currency: "INR",
      },
      gst: {
        total: totalGST,
        last30Days: Math.round((revenueData.last30DaysTax || 0) * 100) / 100,
        currency: "INR",
      },
      totalAdminEarnings: {
        total: totalCommission + totalPlatformFee + totalDeliveryFee + totalGST,
        last30Days:
          last30DaysCommission +
          last30DaysPlatformFee +
          last30DaysDeliveryFee +
          last30DaysGST,
        currency: "INR",
      },
      orders: {
        total: totalOrders,
        byStatus: {
          pending: orderStatusMap.pending || 0,
          confirmed: orderStatusMap.confirmed || 0,
          preparing: orderStatusMap.preparing || 0,
          ready: orderStatusMap.ready || 0,
          out_for_delivery: orderStatusMap.out_for_delivery || 0,
          delivered: orderStatusMap.delivered || 0,
          cancelled: orderStatusMap.cancelled || 0,
        },
      },
      partners: {
        total: activePartners,
        restaurants: activeRestaurantsCount,
        delivery: activeDeliveryPartners,
      },
      recentActivity: {
        orders: recentOrders,
        restaurants: recentRestaurants,
        period: "last24Hours",
      },
      monthlyData: monthlyData, // Add monthly data for graphs
      // Additional stats
      restaurants: {
        total: totalRestaurants,
        active: activeRestaurantsCount,
        pendingRequests: pendingRestaurantRequests,
      },
      deliveryBoys: {
        total: totalDeliveryBoys,
        active: activeDeliveryPartners,
        pendingRequests: pendingDeliveryBoyRequests,
      },
      foods: {
        total: totalFoods,
      },
      addons: {
        total: totalAddons,
      },
      customers: {
        total: totalCustomers,
      },
      orderStats: {
        pending: pendingOrders,
        completed: completedOrders,
      },
    });
  } catch (error) {
    logger.error(`Error fetching dashboard stats: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch dashboard statistics");
  }
});

/**
 * Get All Admins
 * GET /api/admin/admins
 */
export const getAdmins = asyncHandler(async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const admins = await Admin.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const total = await Admin.countDocuments(query);

    return successResponse(res, 200, "Admins retrieved successfully", {
      admins,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Error fetching admins: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admins");
  }
});

/**
 * Get Admin by ID
 * GET /api/admin/admins/:id
 */
export const getAdminById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    return successResponse(res, 200, "Admin retrieved successfully", { admin });
  } catch (error) {
    logger.error(`Error fetching admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin");
  }
});

/**
 * Create Admin (only by existing admin)
 * POST /api/admin/admins
 */
export const createAdmin = asyncHandler(async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return errorResponse(res, 400, "Name, email, and password are required");
    }

    if (password.length < 6) {
      return errorResponse(
        res,
        400,
        "Password must be at least 6 characters long",
      );
    }

    // Check if admin already exists with this email
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return errorResponse(res, 400, "Admin already exists with this email");
    }

    // Create new admin
    const adminData = {
      name,
      email: email.toLowerCase(),
      password,
      isActive: true,
      phoneVerified: false,
    };

    if (phone) {
      adminData.phone = phone;
    }

    const admin = await Admin.create(adminData);

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin created: ${admin._id}`, {
      email,
      createdBy: req.user._id,
    });

    return successResponse(res, 201, "Admin created successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error creating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to create admin");
  }
});

/**
 * Update Admin
 * PUT /api/admin/admins/:id
 */
export const updateAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isActive } = req.body;

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Prevent updating own account's isActive status
    if (id === req.user._id.toString() && isActive === false) {
      return errorResponse(res, 400, "You cannot deactivate your own account");
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase();
    if (phone !== undefined) admin.phone = phone;
    if (isActive !== undefined) admin.isActive = isActive;

    await admin.save();

    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin updated: ${id}`, { updatedBy: req.user._id });

    return successResponse(res, 200, "Admin updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin: ${error.message}`);

    if (error.code === 11000) {
      return errorResponse(res, 400, "Admin with this email already exists");
    }

    return errorResponse(res, 500, "Failed to update admin");
  }
});

/**
 * Delete Admin
 * DELETE /api/admin/admins/:id
 */
export const deleteAdmin = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting own account
    if (id === req.user._id.toString()) {
      return errorResponse(res, 400, "You cannot delete your own account");
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    await Admin.deleteOne({ _id: id });

    logger.info(`Admin deleted: ${id}`, { deletedBy: req.user._id });

    return successResponse(res, 200, "Admin deleted successfully");
  } catch (error) {
    logger.error(`Error deleting admin: ${error.message}`);
    return errorResponse(res, 500, "Failed to delete admin");
  }
});

/**
 * Get Current Admin Profile
 * GET /api/admin/profile
 */
export const getAdminProfile = asyncHandler(async (req, res) => {
  try {
    const admin = await Admin.findById(req.user._id).select("-password").lean();

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    return successResponse(res, 200, "Admin profile retrieved successfully", {
      admin,
    });
  } catch (error) {
    logger.error(`Error fetching admin profile: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch admin profile");
  }
});

/**
 * Update Current Admin Profile
 * PUT /api/admin/profile
 */
export const updateAdminProfile = asyncHandler(async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;

    const admin = await Admin.findById(req.user._id);

    if (!admin) {
      return errorResponse(res, 404, "Admin profile not found");
    }

    // Update fields (email cannot be changed via profile update)
    if (name !== undefined && name !== null) {
      admin.name = name.trim();
    }

    if (phone !== undefined) {
      // Allow empty string to clear phone number
      admin.phone = phone ? phone.trim() : null;
    }

    if (profileImage !== undefined) {
      // Allow empty string to clear profile image
      admin.profileImage = profileImage || null;
    }

    // Save to database
    await admin.save();

    // Remove password from response
    const adminResponse = admin.toObject();
    delete adminResponse.password;

    logger.info(`Admin profile updated: ${admin._id}`, {
      updatedFields: {
        name,
        phone,
        profileImage: profileImage ? "updated" : "not changed",
      },
    });

    return successResponse(res, 200, "Profile updated successfully", {
      admin: adminResponse,
    });
  } catch (error) {
    logger.error(`Error updating admin profile: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update profile");
  }
});

/**
 * Change Admin Password
 * PUT /api/admin/settings/change-password
 */
export const changeAdminPassword = asyncHandler(async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return errorResponse(
        res,
        400,
        "Current password and new password are required",
      );
    }

    if (newPassword.length < 6) {
      return errorResponse(
        res,
        400,
        "New password must be at least 6 characters long",
      );
    }

    // Get admin with password field
    const admin = await Admin.findById(req.user._id).select("+password");

    if (!admin) {
      return errorResponse(res, 404, "Admin not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return errorResponse(res, 401, "Current password is incorrect");
    }

    // Check if new password is same as current
    const isSamePassword = await admin.comparePassword(newPassword);
    if (isSamePassword) {
      return errorResponse(
        res,
        400,
        "New password must be different from current password",
      );
    }

    // Update password (pre-save hook will hash it)
    admin.password = newPassword;
    await admin.save();

    logger.info(`Admin password changed: ${admin._id}`);

    return successResponse(res, 200, "Password changed successfully");
  } catch (error) {
    logger.error(`Error changing admin password: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to change password");
  }
});

/**
 * Get All Users (Customers) with Order Statistics
 * GET /api/admin/users
 */
export const getUsers = asyncHandler(async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      search,
      status,
      sortBy,
      orderDate,
      joiningDate,
    } = req.query;
    const User = (await import("../../auth/models/User.js")).default;

    // Build query
    const query = { role: "user" }; // Only get users, not restaurants/delivery/admins

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status === "active") {
      query.isActive = true;
    } else if (status === "inactive") {
      query.isActive = false;
    }

    // Joining date filter (Global Database filter)
    if (joiningDate) {
      const startDate = new Date(joiningDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(joiningDate);
      endDate.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Order date filter (Find users who ordered on this date)
    if (orderDate) {
      const startDate = new Date(orderDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(orderDate);
      endDate.setHours(23, 59, 59, 999);

      const userIdsWithOrders = await Order.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).distinct("userId");

      query._id = { $in: userIdsWithOrders };
    }

    // Get users
    const users = await User.find(query)
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Get user IDs
    const userIds = users.map((user) => user._id);

    // Get order statistics for each user
    const orderStats = await Order.aggregate([
      {
        $match: {
          userId: { $in: userIds },
        },
      },
      {
        $group: {
          _id: "$userId",
          totalOrders: { $sum: 1 },
          totalAmount: {
            $sum: {
              $convert: {
                input: {
                  $ifNull: ["$pricing.total", { $ifNull: ["$total", 0] }],
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);

    // Create a map of userId -> stats
    const statsMap = {};
    orderStats.forEach((stat) => {
      statsMap[stat._id.toString()] = {
        totalOrder: stat.totalOrders || 0,
        totalOrderAmount: Number(stat.totalAmount || 0),
      };
    });

    // Format users with order statistics
    const formattedUsers = users.map((user, index) => {
      const stats = statsMap[user._id.toString()] || {
        totalOrder: 0,
        totalOrderAmount: 0,
      };

      // Format joining date
      const joiningDate = new Date(user.createdAt);
      const formattedDate = joiningDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      return {
        sl: parseInt(offset) + index + 1,
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        totalOrder: stats.totalOrder,
        totalOrderAmount: stats.totalOrderAmount,
        joiningDate: formattedDate,
        status: user.isActive !== false, // Default to true if not set
        createdAt: user.createdAt,
      };
    });

    // Apply sorting
    if (sortBy) {
      if (sortBy === "name-asc") {
        formattedUsers.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "name-desc") {
        formattedUsers.sort((a, b) => b.name.localeCompare(a.name));
      } else if (sortBy === "orders-asc") {
        formattedUsers.sort((a, b) => a.totalOrder - b.totalOrder);
      } else if (sortBy === "orders-desc") {
        formattedUsers.sort((a, b) => b.totalOrder - a.totalOrder);
      }
    }

    const total = await User.countDocuments(query);

    return successResponse(res, 200, "Users retrieved successfully", {
      users: formattedUsers,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch users");
  }
});

/**
 * Get User by ID with Full Details
 * GET /api/admin/users/:id
 */
export const getUserById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const User = (await import("../../auth/models/User.js")).default;

    const user = await User.findById(id).select("-password -__v").lean();

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    // Get order statistics
    const orderStats = await Order.aggregate([
      {
        $match: { userId: user._id },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: {
            $sum: {
              $convert: {
                input: {
                  $ifNull: ["$pricing.total", { $ifNull: ["$total", 0] }],
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          orders: {
            $push: {
              orderId: "$orderId",
              status: "$status",
              total: "$pricing.total",
              createdAt: "$createdAt",
              restaurantName: "$restaurantName",
            },
          },
        },
      },
    ]);

    const stats = orderStats[0] || {
      totalOrders: 0,
      totalAmount: 0,
      orders: [],
    };

    // Format joining date
    const joiningDate = new Date(user.createdAt);
    const formattedDate = joiningDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return successResponse(res, 200, "User retrieved successfully", {
      user: {
        id: user._id.toString(),
        name: user.name || "N/A",
        email: user.email || "N/A",
        phone: user.phone || "N/A",
        phoneVerified: user.phoneVerified || false,
        profileImage: user.profileImage || null,
        role: user.role,
        signupMethod: user.signupMethod,
        isActive: user.isActive !== false,
        addresses: user.addresses || [],
        preferences: user.preferences || {},
        wallet: user.wallet || {},
        dateOfBirth: user.dateOfBirth || null,
        anniversary: user.anniversary || null,
        gender: user.gender || null,
        joiningDate: formattedDate,
        createdAt: user.createdAt,
        totalOrders: stats.totalOrders,
        totalOrderAmount: stats.totalAmount,
        orders: stats.orders.slice(0, 10), // Last 10 orders
      },
    });
  } catch (error) {
    logger.error(`Error fetching user: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch user");
  }
});

/**
 * Update User Status (Active/Inactive)
 * PUT /api/admin/users/:id/status
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const User = (await import("../../auth/models/User.js")).default;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const user = await User.findById(id);

    if (!user) {
      return errorResponse(res, 404, "User not found");
    }

    user.isActive = isActive;
    await user.save();

    logger.info(`User status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "User status updated successfully", {
      user: {
        id: user._id.toString(),
        name: user.name,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating user status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update user status");
  }
});

/**
 * Get All Restaurants
 * GET /api/admin/restaurants
 * Query params: page, limit, search, status, cuisine, zone
 */
export const getRestaurants = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, cuisine, zone } = req.query;

    // Build query
    let query = {};

    // Status filter - Default to active only (approved restaurants)
    // Only show inactive if explicitly requested via status filter
    // IMPORTANT: Restaurants should only appear in main list AFTER admin approval
    // Inactive restaurants (pending approval) should only appear in "New Joining Request" section
    if (status === "inactive") {
      query.isActive = false;
    } else {
      // Default: Show only active (approved) restaurants
      // This ensures that restaurants only appear in main list after admin approval
      query.isActive = true;
    }

    console.log("ðŸ” Admin Restaurants List Query:", {
      status,
      isActive: query.isActive,
      query: JSON.stringify(query, null, 2),
    });

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { ownerName: { $regex: search, $options: "i" } },
        { ownerPhone: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Cuisine filter
    if (cuisine) {
      query.cuisines = { $in: [new RegExp(cuisine, "i")] };
    }

    // Zone filter
    if (zone && zone !== "All over the World") {
      query.$or = [
        { "location.area": { $regex: zone, $options: "i" } },
        { "location.city": { $regex: zone, $options: "i" } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Restaurant.countDocuments(query);

    return successResponse(res, 200, "Restaurants retrieved successfully", {
      restaurants: restaurants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurants: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurants");
  }
});

/**
 * Get Restaurant Referral Mapping
 * GET /api/admin/restaurants/referral-mapping
 * Query params: page, limit, search, referralStatus
 */
export const getRestaurantReferralMappings = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      referralStatus,
    } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const skip = (parsedPage - 1) * parsedLimit;
    const trimmedSearch = String(search || "").trim();

    const query = {
      referredBy: { $ne: null },
    };

    if (referralStatus && ["pending", "completed"].includes(String(referralStatus).toLowerCase())) {
      query.referralStatus = String(referralStatus).toLowerCase();
    }

    if (trimmedSearch) {
      const referrerMatches = await Restaurant.find({
        $or: [
          { name: { $regex: trimmedSearch, $options: "i" } },
          { ownerName: { $regex: trimmedSearch, $options: "i" } },
          { phone: { $regex: trimmedSearch, $options: "i" } },
          { email: { $regex: trimmedSearch, $options: "i" } },
          { referralCode: { $regex: trimmedSearch, $options: "i" } },
        ],
      })
        .select("_id")
        .lean();

      const referrerIds = referrerMatches.map((restaurant) => restaurant._id);

      query.$or = [
        { name: { $regex: trimmedSearch, $options: "i" } },
        { ownerName: { $regex: trimmedSearch, $options: "i" } },
        { phone: { $regex: trimmedSearch, $options: "i" } },
        { email: { $regex: trimmedSearch, $options: "i" } },
        { referralCode: { $regex: trimmedSearch, $options: "i" } },
        { referredByName: { $regex: trimmedSearch, $options: "i" } },
      ];

      if (referrerIds.length > 0) {
        query.$or.push({ referredBy: { $in: referrerIds } });
      }
    }

    const [mappedRestaurants, total, settings] = await Promise.all([
      Restaurant.find(query)
        .populate("referredBy", "name referralCode restaurantId phone email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      Restaurant.countDocuments(query),
      (async () => {
        try {
          const BusinessSettings = (await import("../models/BusinessSettings.js")).default;
          return await BusinessSettings.getSettings();
        } catch {
          return null;
        }
      })(),
    ]);

    const referredRestaurantIds = mappedRestaurants.map((restaurant) => restaurant._id);
    let deliveredCountByRestaurantId = new Map();

    if (referredRestaurantIds.length > 0) {
      const deliveredCounts = await Order.aggregate([
        {
          $match: {
            restaurantId: { $in: referredRestaurantIds },
            status: "delivered",
          },
        },
        {
          $group: {
            _id: "$restaurantId",
            deliveredOrders: { $sum: 1 },
          },
        },
      ]);

      deliveredCountByRestaurantId = new Map(
        deliveredCounts.map((item) => [String(item._id), item.deliveredOrders])
      );
    }

    const applyOn = settings?.restaurantReferral?.applyOn || "First Order Only";
    const commissionFallback = Number(settings?.restaurantReferral?.commissionPercentage);
    const requiredOrders = String(applyOn).toLowerCase().includes("first") ? 1 : 1;

    const mappings = mappedRestaurants.map((restaurant) => {
      const deliveredOrders = deliveredCountByRestaurantId.get(String(restaurant._id)) || 0;
      const progressCompleted =
        restaurant.referralStatus === "completed" ? requiredOrders : Math.min(deliveredOrders, requiredOrders);
      const commissionPercentage = Number.isFinite(Number(restaurant.referralCommission))
        ? Number(restaurant.referralCommission)
        : (Number.isFinite(commissionFallback) ? commissionFallback : 0);

      return {
        id: restaurant._id?.toString(),
        joinedAt: restaurant.createdAt || null,
        referredRestaurant: {
          id: restaurant._id?.toString(),
          name: restaurant.name || "Restaurant",
          restaurantId: restaurant.restaurantId || null,
          referralCode: restaurant.referralCode || null,
          phone: restaurant.phone || null,
          email: restaurant.email || null,
          isActive: !!restaurant.isActive,
        },
        referrerRestaurant: {
          id: restaurant.referredBy?._id?.toString?.() || restaurant.referredBy?.toString?.() || null,
          name: restaurant.referredBy?.name || restaurant.referredByName || "Unknown",
          restaurantId: restaurant.referredBy?.restaurantId || null,
          referralCode: restaurant.referredBy?.referralCode || null,
          phone: restaurant.referredBy?.phone || null,
          email: restaurant.referredBy?.email || null,
        },
        commissionPercentage,
        progress: {
          completed: progressCompleted,
          required: requiredOrders,
          deliveredOrders,
        },
        status: restaurant.referralStatus || "pending",
      };
    });

    return successResponse(res, 200, "Restaurant referral mappings retrieved successfully", {
      mappings,
      policy: {
        commissionPercentage: Number.isFinite(commissionFallback) ? commissionFallback : 5,
        applyOn,
      },
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(`Error fetching restaurant referral mappings: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant referral mappings");
  }
});

/**
 * Update Restaurant Status (Active/Inactive/Ban)
 * PUT /api/admin/restaurants/:id/status
 */
export const updateRestaurantStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "isActive must be a boolean value");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    restaurant.isActive = isActive;

    // Keep approval status consistent with activation so the same restaurant
    // behaves consistently across admin, restaurant, and user-facing flows.
    if (isActive && !restaurant.approvedAt) {
      restaurant.approvedAt = new Date();
      restaurant.rejectionReason = null;
      restaurant.rejectedAt = null;
      restaurant.rejectedBy = null;
    }

    await restaurant.save();

    logger.info(`Restaurant status updated: ${id}`, {
      isActive,
      updatedBy: req.user._id,
    });

    return successResponse(res, 200, "Restaurant status updated successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
      },
    });
  } catch (error) {
    logger.error(`Error updating restaurant status: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update restaurant status");
  }
});

/**
 * Get Restaurant Join Requests
 * GET /api/admin/restaurants/requests
 * Query params: status (pending, rejected), page, limit, search
 */
export const getRestaurantJoinRequests = asyncHandler(async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 50, search } = req.query;

    // Build query
    let query = {};

    // Status filter
    // Pending = restaurants with ALL onboarding steps completed (step 4) but not yet active
    // Rejected = restaurants that have rejectionReason
    if (status === "pending") {
      // Pending = onboarding completed, not yet approved, and not rejected
      query.$and = [
        { "onboarding.completedSteps": { $gte: 1 } },
        {
          $or: [{ approvedAt: { $exists: false } }, { approvedAt: null }],
        },
        {
          $or: [
            { rejectionReason: { $exists: false } },
            { rejectionReason: null },
            { rejectionReason: "" },
          ],
        },
      ];
    } else if (status === "rejected") {
      query["rejectionReason"] = { $exists: true, $ne: null, $ne: "" };
    }

    // Search filter - combine with $and if search is provided
    if (search && search.trim()) {
      const searchConditions = {
        $or: [
          { name: { $regex: search.trim(), $options: "i" } },
          { ownerName: { $regex: search.trim(), $options: "i" } },
          { ownerPhone: { $regex: search.trim(), $options: "i" } },
          { phone: { $regex: search.trim(), $options: "i" } },
          { email: { $regex: search.trim(), $options: "i" } },
        ],
      };

      // If query already has $and, add search to it; otherwise create new $and
      if (query.$and) {
        query.$and.push(searchConditions);
      } else {
        // Convert existing query conditions to $and format
        const baseConditions = { ...query };
        query = {
          $and: [baseConditions, searchConditions],
        };
      }
    }

    console.log(
      "ðŸ” Restaurant Join Requests Query:",
      JSON.stringify(query, null, 2),
    );

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch restaurants
    const restaurants = await Restaurant.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Debug: Log found restaurants with detailed info
    console.log(`ðŸ“Š Found ${restaurants.length} restaurants matching query:`, {
      status,
      queryStructure: Object.keys(query).length,
      restaurantsFound: restaurants.length,
      sampleRestaurants: restaurants.slice(0, 5).map((r) => ({
        _id: r._id.toString().substring(0, 10) + "...",
        name: r.name,
        isActive: r.isActive,
        completedSteps: r.onboarding?.completedSteps,
        hasRejectionReason: !!r.rejectionReason,
        hasName: !!r.name,
        hasCuisines: !!r.cuisines && r.cuisines.length > 0,
        hasOpenDays: !!r.openDays && r.openDays.length > 0,
        hasEstimatedDeliveryTime: !!r.estimatedDeliveryTime,
        hasFeaturedDish: !!r.featuredDish,
      })),
    });

    // Get total count
    const total = await Restaurant.countDocuments(query);

    console.log(`ðŸ“Š Total count: ${total} restaurants`);

    // Also log a sample of ALL inactive restaurants (for debugging)
    if (status === "pending" && restaurants.length === 0) {
      const allInactive = await Restaurant.find({
        "onboarding.completedSteps": { $gte: 4 },
        $and: [
          {
            $or: [{ approvedAt: { $exists: false } }, { approvedAt: null }],
          },
          {
            $or: [
              { rejectionReason: { $exists: false } },
              { rejectionReason: null },
              { rejectionReason: "" },
            ],
          },
        ],
      })
        .select(
          "name isActive onboarding.completedSteps cuisines openDays estimatedDeliveryTime featuredDish",
        )
        .limit(10)
        .lean();

      const totalInactive = await Restaurant.countDocuments({
        "onboarding.completedSteps": { $gte: 4 },
        $and: [
          {
            $or: [{ approvedAt: { $exists: false } }, { approvedAt: null }],
          },
          {
            $or: [
              { rejectionReason: { $exists: false } },
              { rejectionReason: null },
              { rejectionReason: "" },
            ],
          },
        ],
      });

      console.log(
        "âš ï¸ No restaurants found with query. Debugging inactive restaurants:",
        {
          totalInactive,
          queryUsed: JSON.stringify(query, null, 2),
          samples: allInactive.map((r) => ({
            _id: r._id.toString(),
            name: r.name,
            isActive: r.isActive,
            completedSteps: r.onboarding?.completedSteps,
            hasAllFields: {
              hasName: !!r.name && r.name !== "",
              hasCuisines:
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0,
              hasOpenDays:
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0,
              hasEstimatedDeliveryTime:
                !!r.estimatedDeliveryTime && r.estimatedDeliveryTime !== "",
              hasFeaturedDish: !!r.featuredDish && r.featuredDish !== "",
            },
            fieldValues: {
              name: r.name || "MISSING",
              cuisinesCount: r.cuisines?.length || 0,
              openDaysCount: r.openDays?.length || 0,
              estimatedDeliveryTime: r.estimatedDeliveryTime || "MISSING",
              featuredDish: r.featuredDish || "MISSING",
            },
            shouldMatch:
              (!!r.name &&
                r.name !== "" &&
                !!r.cuisines &&
                Array.isArray(r.cuisines) &&
                r.cuisines.length > 0 &&
                !!r.openDays &&
                Array.isArray(r.openDays) &&
                r.openDays.length > 0 &&
                !!r.estimatedDeliveryTime &&
                r.estimatedDeliveryTime !== "" &&
                !!r.featuredDish &&
                r.featuredDish !== "") ||
              r.onboarding?.completedSteps === 4,
          })),
        },
      );
    }

    // Format response to match frontend expectations
    const formattedRequests = restaurants.map((restaurant, index) => {
      // Get zone from location
      let zone = "All over the World";
      if (restaurant.location?.area) {
        zone = restaurant.location.area;
      } else if (restaurant.location?.city) {
        zone = restaurant.location.city;
      }

      // Get business model (could be from subscription or commission - defaulting for now)
      const businessModel = restaurant.businessModel || "Commission Base";

      // Get status
      const requestStatus = restaurant.rejectionReason ? "Rejected" : "Pending";

      return {
        _id: restaurant._id.toString(),
        sl: skip + index + 1,
        restaurantName: restaurant.name || "N/A",
        restaurantImage:
          restaurant.profileImage?.url ||
          restaurant.onboarding?.step2?.profileImageUrl?.url ||
          "https://via.placeholder.com/40",
        ownerName: restaurant.ownerName || "N/A",
        ownerPhone: restaurant.ownerPhone || restaurant.phone || "N/A",
        zone: zone,
        businessModel: businessModel,
        status: requestStatus,
        rejectionReason: restaurant.rejectionReason || null,
        createdAt: restaurant.createdAt,
        // Include full data for view/details
        fullData: {
          ...restaurant,
          _id: restaurant._id.toString(),
        },
      };
    });

    return successResponse(
      res,
      200,
      "Restaurant join requests retrieved successfully",
      {
        requests: formattedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant join requests: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant join requests");
  }
});

/**
 * Approve Restaurant Join Request
 * POST /api/admin/restaurants/:id/approve
 */
export const approveRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    if (restaurant.isActive) {
      return errorResponse(res, 400, "Restaurant is already approved");
    }

    if (restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Cannot approve a rejected restaurant. Please remove rejection reason first.",
      );
    }

    // Activate restaurant
    restaurant.isActive = true;
    restaurant.approvedAt = new Date();
    restaurant.approvedBy = adminId;
    restaurant.rejectionReason = undefined; // Clear any previous rejection

    await restaurant.save();

    logger.info(`Restaurant approved: ${id}`, {
      approvedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant approved successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        isActive: restaurant.isActive,
        approvedAt: restaurant.approvedAt,
      },
    });
  } catch (error) {
    logger.error(`Error approving restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to approve restaurant");
  }
});

/**
 * Update Restaurant Dining Settings
 * PUT /api/admin/restaurants/:id/dining-settings
 */
export const updateRestaurantDiningSettings = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { diningSettings } = req.body;

    if (!diningSettings) {
      return errorResponse(res, 400, "Dining settings are required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Update dining settings
    restaurant.diningSettings = {
      ...restaurant.diningSettings,
      ...diningSettings,
    };

    await restaurant.save();

    logger.info(`Restaurant dining settings updated: ${id}`, {
      updatedBy: req.user._id,
      diningSettings: restaurant.diningSettings,
    });

    return successResponse(res, 200, "Dining settings updated successfully", {
      restaurant: {
        id: restaurant._id,
        diningSettings: restaurant.diningSettings,
      },
    });
  } catch (error) {
    logger.error(`Error updating dining settings: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to update dining settings");
  }
});

/**
 * Reject Restaurant Join Request
 * POST /api/admin/restaurants/:id/reject
 */
export const rejectRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return errorResponse(res, 400, "Rejection reason is required");
    }

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Set rejection details (allow updating if already rejected)
    restaurant.rejectionReason = reason.trim();
    restaurant.rejectedAt = new Date();
    restaurant.rejectedBy = adminId;
    restaurant.isActive = false; // Ensure it's inactive

    await restaurant.save();

    logger.info(`Restaurant rejected: ${id}`, {
      rejectedBy: adminId,
      reason: reason,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant rejected successfully", {
      restaurant: {
        id: restaurant._id.toString(),
        name: restaurant.name,
        rejectionReason: restaurant.rejectionReason,
      },
    });
  } catch (error) {
    logger.error(`Error rejecting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reject restaurant");
  }
});

/**
 * Reverify Restaurant (Resubmit for approval)
 * POST /api/admin/restaurants/:id/reverify
 */
export const reverifyRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Check if restaurant was rejected
    if (!restaurant.rejectionReason) {
      return errorResponse(
        res,
        400,
        "Restaurant is not rejected. Only rejected restaurants can be reverified.",
      );
    }

    // Clear rejection details and mark as pending again
    restaurant.rejectionReason = null;
    restaurant.rejectedAt = undefined;
    restaurant.rejectedBy = undefined;
    restaurant.isActive = false; // Keep inactive until approved

    await restaurant.save();

    logger.info(`Restaurant reverified: ${id}`, {
      reverifiedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(
      res,
      200,
      "Restaurant reverified successfully. Waiting for admin approval.",
      {
        restaurant: {
          id: restaurant._id.toString(),
          name: restaurant.name,
          isActive: restaurant.isActive,
          rejectionReason: null,
        },
      },
    );
  } catch (error) {
    logger.error(`Error reverifying restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to reverify restaurant");
  }
});

/**
 * Get Restaurant by ID (Admin)
 * GET /api/admin/restaurants/:id
 */
export const getRestaurantById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findById(id).lean();
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }
    return successResponse(res, 200, "Restaurant retrieved successfully", { restaurant });
  } catch (error) {
    logger.error(`Error fetching restaurant by id: ${error.message}`);
    return errorResponse(res, 500, "Failed to fetch restaurant");
  }
});

/**
 * Update Restaurant by Admin
 * PUT /api/admin/restaurants/:id
 */
export const updateRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    const {
      restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone,
      primaryContactNumber,
      location,
      menuImages,
      profileImage,
      cuisines,
      openingTime,
      closingTime,
      openDays,
      panNumber,
      nameOnPan,
      panImage,
      gstRegistered,
      gstNumber,
      gstLegalName,
      gstAddress,
      gstImage,
      fssaiNumber,
      fssaiExpiry,
      fssaiImage,
      accountNumber,
      ifscCode,
      accountHolderName,
      accountType,
      estimatedDeliveryTime,
      featuredDish,
      featuredPrice,
      offer,
      diningSettings,
    } = req.body;

    await initializeCloudinary();

    // Handle profile image
    if (profileImage !== undefined) {
      if (typeof profileImage === "string" && profileImage.startsWith("data:")) {
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, { folder: "appzeto/restaurant/profile", resource_type: "image" });
        restaurant.profileImage = { url: result.secure_url, publicId: result.public_id };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
        restaurant.onboarding.step2.profileImageUrl = { url: result.secure_url, publicId: result.public_id };
      } else if (profileImage && profileImage.url) {
        restaurant.profileImage = profileImage;
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
        restaurant.onboarding.step2.profileImageUrl = profileImage;
      } else if (typeof profileImage === "string" && profileImage.startsWith("http")) {
        restaurant.profileImage = { url: profileImage };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
        restaurant.onboarding.step2.profileImageUrl = { url: profileImage };
      }
    }

    // Handle menu images
    if (menuImages !== undefined && Array.isArray(menuImages)) {
      const processedImages = [];
      for (const img of menuImages) {
        if (typeof img === "string" && img.startsWith("data:")) {
          const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const result = await uploadToCloudinary(buffer, { folder: "appzeto/restaurant/menu", resource_type: "image" });
          processedImages.push({ url: result.secure_url, publicId: result.public_id });
        } else if (typeof img === "string" && img.startsWith("http")) {
          processedImages.push({ url: img });
        } else if (img && img.url) {
          processedImages.push(img);
        }
      }
      restaurant.menuImages = processedImages;
      if (!restaurant.onboarding) restaurant.onboarding = {};
      if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
      restaurant.onboarding.step2.menuImageUrls = processedImages;
    }

    // Handle PAN image
    if (panImage !== undefined) {
      if (typeof panImage === "string" && panImage.startsWith("data:")) {
        const base64Data = panImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, { folder: "appzeto/restaurant/pan", resource_type: "image" });
        restaurant.panImage = { url: result.secure_url, publicId: result.public_id };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.pan) restaurant.onboarding.step3.pan = {};
        restaurant.onboarding.step3.pan.image = { url: result.secure_url, publicId: result.public_id };
      } else if (panImage && panImage.url) {
        restaurant.panImage = panImage;
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.pan) restaurant.onboarding.step3.pan = {};
        restaurant.onboarding.step3.pan.image = panImage;
      } else if (typeof panImage === "string" && panImage.startsWith("http")) {
        restaurant.panImage = { url: panImage };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.pan) restaurant.onboarding.step3.pan = {};
        restaurant.onboarding.step3.pan.image = { url: panImage };
      }
    }

    // Handle GST image
    if (gstImage !== undefined && gstRegistered) {
      if (typeof gstImage === "string" && gstImage.startsWith("data:")) {
        const base64Data = gstImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, { folder: "appzeto/restaurant/gst", resource_type: "image" });
        restaurant.gstImage = { url: result.secure_url, publicId: result.public_id };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.gst) restaurant.onboarding.step3.gst = {};
        restaurant.onboarding.step3.gst.image = { url: result.secure_url, publicId: result.public_id };
      } else if (gstImage && gstImage.url) {
        restaurant.gstImage = gstImage;
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.gst) restaurant.onboarding.step3.gst = {};
        restaurant.onboarding.step3.gst.image = gstImage;
      } else if (typeof gstImage === "string" && gstImage.startsWith("http")) {
        restaurant.gstImage = { url: gstImage };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.gst) restaurant.onboarding.step3.gst = {};
        restaurant.onboarding.step3.gst.image = { url: gstImage };
      }
    }

    // Handle FSSAI image
    if (fssaiImage !== undefined) {
      if (typeof fssaiImage === "string" && fssaiImage.startsWith("data:")) {
        const base64Data = fssaiImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, { folder: "appzeto/restaurant/fssai", resource_type: "image" });
        restaurant.fssaiImage = { url: result.secure_url, publicId: result.public_id };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.fssai) restaurant.onboarding.step3.fssai = {};
        restaurant.onboarding.step3.fssai.image = { url: result.secure_url, publicId: result.public_id };
      } else if (fssaiImage && fssaiImage.url) {
        restaurant.fssaiImage = fssaiImage;
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.fssai) restaurant.onboarding.step3.fssai = {};
        restaurant.onboarding.step3.fssai.image = fssaiImage;
      } else if (typeof fssaiImage === "string" && fssaiImage.startsWith("http")) {
        restaurant.fssaiImage = { url: fssaiImage };
        if (!restaurant.onboarding) restaurant.onboarding = {};
        if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
        if (!restaurant.onboarding.step3.fssai) restaurant.onboarding.step3.fssai = {};
        restaurant.onboarding.step3.fssai.image = { url: fssaiImage };
      }
    }

    // Update basic fields
    if (restaurantName !== undefined) restaurant.name = restaurantName;
    if (ownerName !== undefined) restaurant.ownerName = ownerName;
    if (ownerEmail !== undefined) restaurant.ownerEmail = ownerEmail;
    if (ownerPhone !== undefined) restaurant.ownerPhone = ownerPhone ? normalizePhoneNumber(ownerPhone) || ownerPhone : ownerPhone;
    if (primaryContactNumber !== undefined) restaurant.primaryContactNumber = primaryContactNumber ? normalizePhoneNumber(primaryContactNumber) || primaryContactNumber : primaryContactNumber;
    if (location !== undefined) restaurant.location = { ...restaurant.location, ...location };
    if (cuisines !== undefined) restaurant.cuisines = cuisines;
    if (openDays !== undefined) restaurant.openDays = openDays;
    if (openingTime !== undefined || closingTime !== undefined) {
      restaurant.deliveryTimings = {
        openingTime: openingTime || restaurant.deliveryTimings?.openingTime,
        closingTime: closingTime || restaurant.deliveryTimings?.closingTime,
      };
    }
    if (panNumber !== undefined) restaurant.panNumber = panNumber;
    if (nameOnPan !== undefined) restaurant.nameOnPan = nameOnPan;
    if (gstRegistered !== undefined) restaurant.gstRegistered = gstRegistered;
    if (gstNumber !== undefined) restaurant.gstNumber = gstNumber;
    if (gstLegalName !== undefined) restaurant.gstLegalName = gstLegalName;
    if (gstAddress !== undefined) restaurant.gstAddress = gstAddress;
    if (fssaiNumber !== undefined) restaurant.fssaiNumber = fssaiNumber;
    if (fssaiExpiry !== undefined) restaurant.fssaiExpiry = fssaiExpiry;
    if (accountNumber !== undefined) restaurant.accountNumber = accountNumber;
    if (ifscCode !== undefined) restaurant.ifscCode = ifscCode;
    if (accountHolderName !== undefined) restaurant.accountHolderName = accountHolderName;
    if (accountType !== undefined) restaurant.accountType = accountType;
    if (estimatedDeliveryTime !== undefined) restaurant.estimatedDeliveryTime = estimatedDeliveryTime;
    if (featuredDish !== undefined) restaurant.featuredDish = featuredDish;
    if (featuredPrice !== undefined) restaurant.featuredPrice = parseFloat(featuredPrice) || restaurant.featuredPrice;
    if (offer !== undefined) restaurant.offer = offer;
    if (diningSettings !== undefined) restaurant.diningSettings = { ...restaurant.diningSettings, ...diningSettings };

    // Sync onboarding fields
    if (!restaurant.onboarding) restaurant.onboarding = { step1: {}, step2: {}, step3: {}, step4: {} };
    if (!restaurant.onboarding.step1) restaurant.onboarding.step1 = {};
    if (!restaurant.onboarding.step2) restaurant.onboarding.step2 = {};
    if (!restaurant.onboarding.step3) restaurant.onboarding.step3 = {};
    if (!restaurant.onboarding.step4) restaurant.onboarding.step4 = {};

    // Sync Step 1
    if (restaurantName !== undefined) restaurant.onboarding.step1.restaurantName = restaurantName;
    if (ownerName !== undefined) restaurant.onboarding.step1.ownerName = ownerName;
    if (ownerEmail !== undefined) restaurant.onboarding.step1.ownerEmail = ownerEmail;
    if (ownerPhone !== undefined) restaurant.onboarding.step1.ownerPhone = ownerPhone;
    if (primaryContactNumber !== undefined) restaurant.onboarding.step1.primaryContactNumber = primaryContactNumber;
    if (location !== undefined) {
      restaurant.onboarding.step1.location = {
        ...restaurant.onboarding.step1.location,
        ...location,
      };
    }

    // Sync Step 2
    if (cuisines !== undefined) restaurant.onboarding.step2.cuisines = cuisines;
    if (openingTime !== undefined || closingTime !== undefined) {
      restaurant.onboarding.step2.deliveryTimings = {
        openingTime: openingTime || restaurant.onboarding.step2.deliveryTimings?.openingTime,
        closingTime: closingTime || restaurant.onboarding.step2.deliveryTimings?.closingTime,
      };
    }
    if (openDays !== undefined) restaurant.onboarding.step2.openDays = openDays;

    // Sync Step 3
    if (!restaurant.onboarding.step3.pan) restaurant.onboarding.step3.pan = {};
    if (!restaurant.onboarding.step3.gst) restaurant.onboarding.step3.gst = {};
    if (!restaurant.onboarding.step3.fssai) restaurant.onboarding.step3.fssai = {};
    if (!restaurant.onboarding.step3.bank) restaurant.onboarding.step3.bank = {};

    if (panNumber !== undefined) restaurant.onboarding.step3.pan.panNumber = panNumber;
    if (nameOnPan !== undefined) restaurant.onboarding.step3.pan.nameOnPan = nameOnPan;
    
    if (gstRegistered !== undefined) restaurant.onboarding.step3.gst.isRegistered = gstRegistered;
    if (gstNumber !== undefined) restaurant.onboarding.step3.gst.gstNumber = gstNumber;
    if (gstLegalName !== undefined) restaurant.onboarding.step3.gst.legalName = gstLegalName;
    if (gstAddress !== undefined) restaurant.onboarding.step3.gst.address = gstAddress;
    
    if (fssaiNumber !== undefined) restaurant.onboarding.step3.fssai.registrationNumber = fssaiNumber;
    if (fssaiExpiry !== undefined) restaurant.onboarding.step3.fssai.expiryDate = fssaiExpiry;
    
    if (accountNumber !== undefined) restaurant.onboarding.step3.bank.accountNumber = accountNumber;
    if (ifscCode !== undefined) restaurant.onboarding.step3.bank.ifscCode = ifscCode;
    if (accountHolderName !== undefined) restaurant.onboarding.step3.bank.accountHolderName = accountHolderName;
    if (accountType !== undefined) restaurant.onboarding.step3.bank.accountType = accountType;

    // Sync Step 4
    if (estimatedDeliveryTime !== undefined) restaurant.onboarding.step4.estimatedDeliveryTime = estimatedDeliveryTime;
    if (featuredDish !== undefined) restaurant.onboarding.step4.featuredDish = featuredDish;
    if (featuredPrice !== undefined) restaurant.onboarding.step4.featuredPrice = parseFloat(featuredPrice) || restaurant.onboarding.step4.featuredPrice;
    if (offer !== undefined) restaurant.onboarding.step4.offer = offer;

    await restaurant.save();

    logger.info(`Restaurant updated by admin: ${id}`, { updatedBy: adminId });

    return successResponse(res, 200, "Restaurant updated successfully", {
      restaurant: { id: restaurant._id, name: restaurant.name },
    });
  } catch (error) {
    logger.error(`Error updating restaurant: ${error.message}`, { error: error.stack });
    return errorResponse(res, 500, "Failed to update restaurant");
  }
});

/**
 * Create Restaurant by Admin
 * POST /api/admin/restaurants
 */
export const createRestaurant = asyncHandler(async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      // Step 1: Basic Info
      restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone,
      primaryContactNumber,
      location,
      // Step 2: Images & Operational
      menuImages, // Array of image URLs or base64
      profileImage, // Image URL or base64
      cuisines,
      openingTime,
      closingTime,
      openDays,
      // Step 3: Documents
      panNumber,
      nameOnPan,
      panImage, // Image URL or base64
      gstRegistered,
      gstNumber,
      gstLegalName,
      gstAddress,
      gstImage, // Image URL or base64
      fssaiNumber,
      fssaiExpiry,
      fssaiImage, // Image URL or base64
      accountNumber,
      ifscCode,
      accountHolderName,
      accountType,
      // Step 4: Display Info
      estimatedDeliveryTime,
      featuredDish,
      featuredPrice,
      offer,
      // Authentication
      email,
      phone,
      password,
      signupMethod = "email",
    } = req.body;

    // Validation
    if (!restaurantName || !ownerName || !ownerEmail) {
      return errorResponse(
        res,
        400,
        "Restaurant name, owner name, and owner email are required",
      );
    }

    if (!email && !phone) {
      return errorResponse(res, 400, "Either email or phone is required");
    }

    // Normalize phone number if provided
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
    if (phone && !normalizedPhone) {
      return errorResponse(res, 400, "Invalid phone number format");
    }

    // Generate random password if email is provided but password is not
    let finalPassword = password;
    if (email && !password) {
      // Generate a random 12-character password
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      finalPassword = Array.from(
        { length: 12 },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    }

    // Check if restaurant already exists with same email or phone
    const existingRestaurant = await Restaurant.findOne({
      $or: [
        ...(email ? [{ email: email.toLowerCase().trim() }] : []),
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
      ],
    });

    if (existingRestaurant) {
      if (email && existingRestaurant.email === email.toLowerCase().trim()) {
        return errorResponse(
          res,
          400,
          "Restaurant with this email already exists",
        );
      }
      if (normalizedPhone && existingRestaurant.phone === normalizedPhone) {
        return errorResponse(
          res,
          400,
          "Restaurant with this phone number already exists. Please use a different phone number.",
        );
      }
    }

    // Initialize Cloudinary
    await initializeCloudinary();

    // Upload images if provided as base64 or files
    let profileImageData = null;
    if (profileImage) {
      if (
        typeof profileImage === "string" &&
        profileImage.startsWith("data:")
      ) {
        // Base64 image - convert to buffer and upload
        const base64Data = profileImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/profile",
          resource_type: "image",
        });
        profileImageData = {
          url: result.secure_url,
          publicId: result.public_id,
        };
      } else if (
        typeof profileImage === "string" &&
        profileImage.startsWith("http")
      ) {
        // Already a URL
        profileImageData = { url: profileImage };
      } else if (profileImage.url) {
        // Already an object with url
        profileImageData = profileImage;
      }
    }

    let menuImagesData = [];
    if (menuImages && Array.isArray(menuImages) && menuImages.length > 0) {
      for (const img of menuImages) {
        if (typeof img === "string" && img.startsWith("data:")) {
          const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, "base64");
          const result = await uploadToCloudinary(buffer, {
            folder: "appzeto/restaurant/menu",
            resource_type: "image",
          });
          menuImagesData.push({
            url: result.secure_url,
            publicId: result.public_id,
          });
        } else if (typeof img === "string" && img.startsWith("http")) {
          menuImagesData.push({ url: img });
        } else if (img.url) {
          menuImagesData.push(img);
        }
      }
    }

    // Upload document images
    let panImageData = null;
    if (panImage) {
      if (typeof panImage === "string" && panImage.startsWith("data:")) {
        const base64Data = panImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/pan",
          resource_type: "image",
        });
        panImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof panImage === "string" && panImage.startsWith("http")) {
        panImageData = { url: panImage };
      } else if (panImage.url) {
        panImageData = panImage;
      }
    }

    let gstImageData = null;
    if (gstRegistered && gstImage) {
      if (typeof gstImage === "string" && gstImage.startsWith("data:")) {
        const base64Data = gstImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/gst",
          resource_type: "image",
        });
        gstImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (typeof gstImage === "string" && gstImage.startsWith("http")) {
        gstImageData = { url: gstImage };
      } else if (gstImage.url) {
        gstImageData = gstImage;
      }
    }

    let fssaiImageData = null;
    if (fssaiImage) {
      if (typeof fssaiImage === "string" && fssaiImage.startsWith("data:")) {
        const base64Data = fssaiImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const result = await uploadToCloudinary(buffer, {
          folder: "appzeto/restaurant/fssai",
          resource_type: "image",
        });
        fssaiImageData = { url: result.secure_url, publicId: result.public_id };
      } else if (
        typeof fssaiImage === "string" &&
        fssaiImage.startsWith("http")
      ) {
        fssaiImageData = { url: fssaiImage };
      } else if (fssaiImage.url) {
        fssaiImageData = fssaiImage;
      }
    }

    // Create restaurant data
    const restaurantData = {
      name: restaurantName,
      ownerName,
      ownerEmail,
      ownerPhone: ownerPhone
        ? normalizePhoneNumber(ownerPhone) || normalizedPhone
        : normalizedPhone,
      primaryContactNumber: primaryContactNumber
        ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone
        : normalizedPhone,
      location: location || {},
      profileImage: profileImageData,
      menuImages: menuImagesData,
      cuisines: cuisines || [],
      deliveryTimings: {
        openingTime: openingTime || "09:00",
        closingTime: closingTime || "22:00",
      },
      openDays: openDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
      featuredDish: featuredDish || "",
      featuredPrice: featuredPrice || 249,
      offer: offer || "",
      signupMethod,
      // Admin created restaurants are active by default
      isActive: true,
      isAcceptingOrders: true,
      approvedAt: new Date(),
      approvedBy: adminId,
    };

    // Add authentication fields
    if (email) {
      restaurantData.email = email.toLowerCase().trim();
      restaurantData.password = finalPassword; // Will be hashed by pre-save hook
    }
    if (normalizedPhone) {
      restaurantData.phone = normalizedPhone;
      restaurantData.phoneVerified = true; // Admin created, so verified
    }

    // Add onboarding data
    restaurantData.onboarding = {
      step1: {
        restaurantName,
        ownerName,
        ownerEmail,
        ownerPhone: ownerPhone
          ? normalizePhoneNumber(ownerPhone) || normalizedPhone
          : normalizedPhone,
        primaryContactNumber: primaryContactNumber
          ? normalizePhoneNumber(primaryContactNumber) || normalizedPhone
          : normalizedPhone,
        location: location || {},
      },
      step2: {
        menuImageUrls: menuImagesData,
        profileImageUrl: profileImageData,
        cuisines: cuisines || [],
        deliveryTimings: {
          openingTime: openingTime || "09:00",
          closingTime: closingTime || "22:00",
        },
        openDays: openDays || [],
      },
      step3: {
        pan: {
          panNumber: panNumber || "",
          nameOnPan: nameOnPan || "",
          image: panImageData,
        },
        gst: {
          isRegistered: gstRegistered || false,
          gstNumber: gstNumber || "",
          legalName: gstLegalName || "",
          address: gstAddress || "",
          image: gstImageData,
        },
        fssai: {
          registrationNumber: fssaiNumber || "",
          expiryDate: fssaiExpiry || null,
          image: fssaiImageData,
        },
        bank: {
          accountNumber: accountNumber || "",
          ifscCode: ifscCode || "",
          accountHolderName: accountHolderName || "",
          accountType: accountType || "",
        },
      },
      step4: {
        estimatedDeliveryTime: estimatedDeliveryTime || "25-30 mins",
        featuredDish: featuredDish || "",
        featuredPrice: featuredPrice || 249,
        offer: offer || "",
      },
      completedSteps: 4,
    };

    // Create restaurant
    const restaurant = await Restaurant.create(restaurantData);

    logger.info(`Restaurant created by admin: ${restaurant._id}`, {
      createdBy: adminId,
      restaurantName: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
    });

    // Prepare response data
    const responseData = {
      restaurant: {
        id: restaurant._id,
        restaurantId: restaurant.restaurantId,
        name: restaurant.name,
        email: restaurant.email,
        phone: restaurant.phone,
        isActive: restaurant.isActive,
        slug: restaurant.slug,
      },
    };

    // Include generated password in response if email was provided and password was auto-generated
    // This allows admin to share the password with the restaurant
    if (email && !password && finalPassword) {
      responseData.generatedPassword = finalPassword;
      responseData.message =
        "Restaurant created successfully. Please share the generated password with the restaurant.";
    }

    return successResponse(
      res,
      201,
      "Restaurant created successfully",
      responseData,
    );
  } catch (error) {
    logger.error(`Error creating restaurant: ${error.message}`, {
      error: error.stack,
    });

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return errorResponse(
        res,
        400,
        `Restaurant with this ${field} already exists`,
      );
    }

    return errorResponse(
      res,
      500,
      `Failed to create restaurant: ${error.message}`,
    );
  }
});

/**
 * Delete Restaurant
 * DELETE /api/admin/restaurants/:id
 */
export const deleteRestaurant = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return errorResponse(res, 404, "Restaurant not found");
    }

    // Delete restaurant
    await Restaurant.findByIdAndDelete(id);

    logger.info(`Restaurant deleted: ${id}`, {
      deletedBy: adminId,
      restaurantName: restaurant.name,
    });

    return successResponse(res, 200, "Restaurant deleted successfully", {
      restaurant: {
        id: id,
        name: restaurant.name,
      },
    });
  } catch (error) {
    logger.error(`Error deleting restaurant: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to delete restaurant");
  }
});

/**
 * Get All Offers with Restaurant and Dish Details
 * GET /api/admin/offers
 * Query params: page, limit, search, status, restaurantId
 */
// Create Offer (Admin)
export const createOffer = asyncHandler(async (req, res) => {
  const {
    couponCode,
    discountPercentage,
    minOrderValue,
    maxDiscountLimit,
    startDate,
    endDate,
    restaurantScope, // 'all' or 'some'
    restaurants = [], // list of restaurant names
    userScope = "all", // 'all', 'first-time', etc.
  } = req.body;

  if (!couponCode || !discountPercentage) {
    return errorResponse(res, 400, "Coupon code and discount percentage are required");
  }

  let restaurantIds = [];
  if (restaurantScope === "all") {
    const allRestaurants = await Restaurant.find({ isActive: true }).select("_id").lean();
    restaurantIds = allRestaurants.map((r) => r._id);
  } else if (restaurants && restaurants.length > 0) {
    const foundRestaurants = await Restaurant.find({ name: { $in: restaurants } }).select("_id").lean();
    restaurantIds = foundRestaurants.map((r) => r._id);
  } else {
    return errorResponse(res, 400, "At least one restaurant must be selected");
  }

  // Create an Offer for each restaurant
  const offersToCreate = restaurantIds.map((rid) => ({
    restaurant: rid,
    goalId: "delight-customers", // default for admin coupons
    discountType: "percentage",
    items: [
      {
        couponCode,
        discountPercentage: parseFloat(discountPercentage),
        // No itemId/itemName means a general coupon
      },
    ],
    customerGroup: userScope === "first-time" ? "new" : "all",
    startDate: startDate ? new Date(startDate) : new Date(),
    endDate: endDate ? new Date(endDate) : null,
    minOrderValue: parseFloat(minOrderValue) || 0,
    maxLimit: parseFloat(maxDiscountLimit) || null,
    status: "active",
  }));

  const createdOffers = await Offer.insertMany(offersToCreate);

  return successResponse(res, 201, `Offers created for ${createdOffers.length} restaurants`, {
    offers: createdOffers,
  });
});

// Update Offer (Admin)
export const updateOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  // Since Admin might want to update common fields
  const offer = await Offer.findById(id);
  if (!offer) {
    return errorResponse(res, 404, "Offer not found");
  }

  // Map incoming data to Offer model structure
  if (updateData.couponCode || updateData.discountPercentage) {
    if (offer.items && offer.items.length > 0) {
      if (updateData.couponCode) offer.items[0].couponCode = updateData.couponCode;
      if (updateData.discountPercentage) offer.items[0].discountPercentage = parseFloat(updateData.discountPercentage);
    }
  }

  if (updateData.minOrderValue !== undefined) offer.minOrderValue = parseFloat(updateData.minOrderValue);
  if (updateData.maxDiscountLimit !== undefined) offer.maxLimit = parseFloat(updateData.maxDiscountLimit);
  if (updateData.startDate) offer.startDate = new Date(updateData.startDate);
  if (updateData.endDate) offer.endDate = new Date(updateData.endDate);
  if (updateData.userScope) offer.customerGroup = updateData.userScope === "first-time" ? "new" : "all";

  await offer.save();

  return successResponse(res, 200, "Offer updated successfully", { offer });
});

// Delete Offer (Admin)
export const deleteOffer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const offer = await Offer.findByIdAndDelete(id);

  if (!offer) {
    return errorResponse(res, 404, "Offer not found");
  }

  return successResponse(res, 200, "Offer deleted successfully");
});

export const getAllOffers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status, restaurantId } = req.query;

    // Build query
    const query = {};

    if (status) {
      query.status = status;
    }

    if (restaurantId) {
      query.restaurant = restaurantId;
    }

    // Calculate pagination
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (parsedPage - 1) * parsedLimit;

    // Fetch offers with restaurant details
    const offers = await Offer.find(query)
      .populate("restaurant", "name restaurantId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    // Get total count
    const total = await Offer.countDocuments(query);

    // Flatten offers to show each item separately
    const offerItems = [];
    offers.forEach((offer) => {
      if (offer.items && offer.items.length > 0) {
        offer.items.forEach((item) => {
          // Apply search filter if provided
          if (search) {
            const searchLower = search.toLowerCase();
            const matchesSearch =
              offer.restaurant?.name?.toLowerCase().includes(searchLower) ||
              item.itemName?.toLowerCase().includes(searchLower) ||
              item.couponCode?.toLowerCase().includes(searchLower);

            if (!matchesSearch) {
              return; // Skip this item if it doesn't match search
            }
          }

          offerItems.push({
            offerId: offer._id.toString(),
            restaurantName: offer.restaurant?.name || "Unknown Restaurant",
            restaurantId:
              offer.restaurant?.restaurantId ||
              offer.restaurant?._id?.toString() ||
              "N/A",
            dishName: item.itemName || "General (Restaurant-wide)",
            dishId: item.itemId || "N/A",
            couponCode: item.couponCode || "N/A",
            discountType: offer.discountType || "percentage",
            discountPercentage: item.discountPercentage || 0,
            originalPrice: item.originalPrice || 0,
            discountedPrice: item.discountedPrice || 0,
            status: offer.status || "active",
            startDate: offer.startDate || null,
            endDate: offer.endDate || null,
            userScope: offer.customerGroup || "all",
            showOnCheckout: offer.showOnCheckout ?? true,
            createdAt: offer.createdAt || new Date(),
          });
        });
      }
    });

    // If search was applied, the total count should reflect the total number of flattened items
    // But for now, we'll keep it simple and just use the count of all offers
    const finalTotal = total;

    // Add SL to offer items
    offerItems.forEach((item, index) => {
      item.sl = skip + index + 1;
    });

    return successResponse(res, 200, "Offers retrieved successfully", {
      offers: offerItems,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: finalTotal,
        pages: Math.ceil(finalTotal / parsedLimit),
      },
    });
  } catch (error) {
    logger.error(`Error fetching offers: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch offers");
  }
});

/**
 * Get Restaurant Analytics for POS
 * GET /api/admin/restaurant-analytics/:restaurantId
 */
export const getRestaurantAnalytics = asyncHandler(async (req, res) => {
  try {
    const { restaurantId } = req.params;

    logger.info(`Fetching restaurant analytics for: ${restaurantId}`);

    if (!restaurantId) {
      return errorResponse(res, 400, "Restaurant ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      logger.warn(`Invalid restaurant ID format: ${restaurantId}`);
      return errorResponse(res, 400, "Invalid restaurant ID format");
    }

    // Get restaurant details
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      logger.warn(`Restaurant not found: ${restaurantId}`);
      return errorResponse(res, 404, "Restaurant not found");
    }

    logger.info(
      `Restaurant found: ${restaurant.name} (${restaurant.restaurantId})`,
    );

    // Calculate date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // Get order statistics - restaurantId can be _id or restaurantId field (both as String in Order model)
    // Match by both restaurant._id and restaurant.restaurantId
    const restaurantIdString = restaurantId.toString();
    const restaurantIdField = restaurant?.restaurantId || restaurantIdString;
    const restaurantObjectIdString = restaurant._id.toString();

    logger.info(`ðŸ“Š Fetching order statistics for restaurant:`, {
      restaurantId: restaurantId,
      restaurantIdString: restaurantIdString,
      restaurantIdField: restaurantIdField,
      restaurantObjectIdString: restaurantObjectIdString,
      restaurantName: restaurant.name,
    });

    // Build query to match restaurantId in multiple formats
    const orderMatchQuery = {
      $or: [
        { restaurantId: restaurantIdString },
        { restaurantId: restaurantIdField },
        { restaurantId: restaurantObjectIdString },
      ],
    };

    logger.info(`ðŸ” Order query:`, orderMatchQuery);

    const orderStats = await Order.aggregate([
      {
        $match: orderMatchQuery,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "delivered"] },
                { $ifNull: ["$pricing.total", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    logger.info(`ðŸ“Š Order stats found:`, orderStats);

    const orderStatusMap = {};
    let totalRevenue = 0;
    orderStats.forEach((stat) => {
      orderStatusMap[stat._id] = stat.count;
      if (stat._id === "delivered") {
        totalRevenue += stat.totalRevenue || 0;
      }
    });

    const totalOrders =
      (orderStatusMap.delivered || 0) +
      (orderStatusMap.cancelled || 0) +
      (orderStatusMap.pending || 0) +
      (orderStatusMap.confirmed || 0) +
      (orderStatusMap.preparing || 0) +
      (orderStatusMap.ready || 0) +
      (orderStatusMap.out_for_delivery || 0);
    const completedOrders = orderStatusMap.delivered || 0;
    const cancelledOrders = orderStatusMap.cancelled || 0;

    logger.info(`ðŸ“Š Calculated order statistics:`, {
      totalOrders,
      completedOrders,
      cancelledOrders,
      orderStatusMap,
    });

    // Get monthly orders and revenue
    const monthlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const monthlyOrders = monthlyStats[0]?.count || 0;
    const monthlyRevenue = monthlyStats[0]?.revenue || 0;

    // Get yearly orders and revenue
    const yearlyStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
          createdAt: { $gte: startOfYear },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
        },
      },
    ]);

    const yearlyOrders = yearlyStats[0]?.count || 0;
    const yearlyRevenue = yearlyStats[0]?.revenue || 0;

    // Get commission and earnings data from OrderSettlement (more accurate)
    // Match settlements by restaurantId (ObjectId in OrderSettlement)
    const restaurantIdForSettlement =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    // Get all settlements for this restaurant
    const allSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
    }).lean();

    // Calculate totals from settlements
    let totalCommission = 0;
    let totalRestaurantEarning = 0;
    let totalFoodPrice = 0;

    allSettlements.forEach((s) => {
      totalCommission += s.restaurantEarning?.commission || 0;
      totalRestaurantEarning += s.restaurantEarning?.netEarning || 0;
      totalFoodPrice += s.restaurantEarning?.foodPrice || 0;
    });

    totalCommission = Math.round(totalCommission * 100) / 100;
    totalRestaurantEarning = Math.round(totalRestaurantEarning * 100) / 100;
    totalFoodPrice = Math.round(totalFoodPrice * 100) / 100;

    // Get monthly settlements
    const monthlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfMonth },
    }).lean();

    let monthlyCommission = 0;
    let monthlyRestaurantEarning = 0;
    monthlySettlements.forEach((s) => {
      monthlyCommission += s.restaurantEarning?.commission || 0;
      monthlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    monthlyCommission = Math.round(monthlyCommission * 100) / 100;
    monthlyRestaurantEarning = Math.round(monthlyRestaurantEarning * 100) / 100;
    const monthlyProfit = monthlyRestaurantEarning; // Restaurant profit = net earning

    // Get yearly settlements
    const yearlySettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: startOfYear },
    }).lean();

    let yearlyCommission = 0;
    let yearlyRestaurantEarning = 0;
    yearlySettlements.forEach((s) => {
      yearlyCommission += s.restaurantEarning?.commission || 0;
      yearlyRestaurantEarning += s.restaurantEarning?.netEarning || 0;
    });

    yearlyCommission = Math.round(yearlyCommission * 100) / 100;
    yearlyRestaurantEarning = Math.round(yearlyRestaurantEarning * 100) / 100;
    const yearlyProfit = yearlyRestaurantEarning; // Restaurant profit = net earning

    // Get average monthly profit (last 12 months)
    const last12MonthsStart = new Date(
      now.getFullYear(),
      now.getMonth() - 12,
      1,
    );
    const last12MonthsSettlements = await OrderSettlement.find({
      restaurantId: restaurantIdForSettlement,
      createdAt: { $gte: last12MonthsStart },
    }).lean();

    // Group by month
    const monthlyEarningsMap = new Map();
    last12MonthsSettlements.forEach((s) => {
      const monthKey = `${new Date(s.createdAt).getFullYear()}-${new Date(s.createdAt).getMonth()}`;
      const current = monthlyEarningsMap.get(monthKey) || 0;
      monthlyEarningsMap.set(
        monthKey,
        current + (s.restaurantEarning?.netEarning || 0),
      );
    });

    const avgMonthlyProfit =
      monthlyEarningsMap.size > 0
        ? Array.from(monthlyEarningsMap.values()).reduce(
          (sum, val) => sum + val,
          0,
        ) / monthlyEarningsMap.size
        : 0;

    // Get commission percentage from RestaurantCommission
    const RestaurantCommission = (
      await import("../models/RestaurantCommission.js")
    ).default;

    // Use restaurant._id directly - ensure it's an ObjectId
    const restaurantIdForQuery =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`ðŸ” Looking for commission config:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForQuery.toString(),
      restaurantName: restaurant.name,
      restaurantIdString: restaurant.restaurantId,
    });

    // Try using the static method first
    let commissionConfig =
      await RestaurantCommission.getCommissionForRestaurant(
        restaurantIdForQuery,
      );

    if (commissionConfig) {
      // Convert to plain object if needed
      commissionConfig = commissionConfig.toObject
        ? commissionConfig.toObject()
        : commissionConfig;
      logger.info(`âœ… Found commission using static method`);
    }

    // If not found, try direct query
    if (!commissionConfig) {
      logger.info(
        `âš ï¸ Static method didn't find commission, trying direct query`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
        status: true,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // If still not found, try without status filter
    if (!commissionConfig) {
      logger.info(`âš ï¸ Trying without status filter`);
      commissionConfig = await RestaurantCommission.findOne({
        restaurant: restaurantIdForQuery,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Also try by restaurantId string field
    if (!commissionConfig && restaurant?.restaurantId) {
      logger.info(
        `ðŸ”„ Trying by restaurantId string: ${restaurant.restaurantId}`,
      );
      commissionConfig = await RestaurantCommission.findOne({
        restaurantId: restaurant.restaurantId,
      });

      if (commissionConfig) {
        commissionConfig = commissionConfig.toObject
          ? commissionConfig.toObject()
          : commissionConfig;
      }
    }

    // Final debug: List all commissions to see what's in DB
    if (!commissionConfig) {
      const allCommissions = await RestaurantCommission.find({}).lean();
      logger.warn(
        `âŒ No commission found. Total commissions in DB: ${allCommissions.length}`,
      );
      logger.info(
        `ðŸ“‹ All commissions:`,
        allCommissions.map((c) => ({
          _id: c._id,
          restaurant: c.restaurant?.toString
            ? c.restaurant.toString()
            : String(c.restaurant),
          restaurantId: c.restaurantId,
          restaurantName: c.restaurantName,
          status: c.status,
          defaultCommission: c.defaultCommission,
        })),
      );

      // Check if restaurant ObjectId matches any commission
      const matching = allCommissions.filter((c) => {
        const cRestaurantId = c.restaurant?.toString
          ? c.restaurant.toString()
          : String(c.restaurant);
        return cRestaurantId === restaurantIdForQuery.toString();
      });
      logger.info(`ðŸ” Matching commissions: ${matching.length}`, matching);
    }

    let commissionPercentage = 0;
    if (commissionConfig) {
      logger.info(`âœ… Commission config found for restaurant ${restaurantId}`);
      logger.info(`Commission config details:`, {
        _id: commissionConfig._id,
        restaurant: commissionConfig.restaurant?.toString
          ? commissionConfig.restaurant.toString()
          : String(commissionConfig.restaurant),
        restaurantId: commissionConfig.restaurantId,
        restaurantName: commissionConfig.restaurantName,
        status: commissionConfig.status,
        hasDefaultCommission: !!commissionConfig.defaultCommission,
        defaultCommissionType: commissionConfig.defaultCommission?.type,
        defaultCommissionValue: commissionConfig.defaultCommission?.value,
      });

      if (commissionConfig.defaultCommission) {
        // Get default commission value - if type is percentage, show the percentage value
        logger.info(`ðŸ“Š Processing defaultCommission:`, {
          type: commissionConfig.defaultCommission.type,
          value: commissionConfig.defaultCommission.value,
          valueType: typeof commissionConfig.defaultCommission.value,
        });

        if (commissionConfig.defaultCommission.type === "percentage") {
          const rawValue = commissionConfig.defaultCommission.value;
          commissionPercentage =
            typeof rawValue === "number" ? rawValue : parseFloat(rawValue) || 0;
          logger.info(
            `âœ… Found commission percentage: ${commissionPercentage}% for restaurant ${restaurantId} (raw value: ${rawValue})`,
          );
        } else if (commissionConfig.defaultCommission.type === "amount") {
          // For amount type, we can't show a percentage, so keep it as 0
          commissionPercentage = 0;
          logger.info(
            `âš ï¸ Commission type is 'amount', not 'percentage' for restaurant ${restaurantId}`,
          );
        }
      } else {
        logger.warn(
          `âš ï¸ Commission config found but no defaultCommission for restaurant ${restaurantId}`,
        );
      }
    } else {
      logger.warn(
        `âŒ No commission config found for restaurant ${restaurantId} (restaurant._id: ${restaurantIdForQuery.toString()})`,
      );
      logger.warn(
        `âš ï¸ This restaurant may not have a commission configuration set up.`,
      );
      logger.warn(
        `ðŸ’¡ To set up commission, go to Restaurant Commission page and add commission for this restaurant.`,
      );
    }

    // Log the final commission percentage being returned
    logger.info(
      `ðŸ“Š Final commission percentage being returned: ${commissionPercentage}%`,
    );
    logger.info(
      `ðŸ“¤ Sending response with commissionPercentage: ${commissionPercentage}`,
    );

    // Get ratings from FeedbackExperience (restaurantId is ObjectId in FeedbackExperience)
    const FeedbackExperience = (await import("../models/FeedbackExperience.js"))
      .default;

    const restaurantIdForRating =
      restaurant._id instanceof mongoose.Types.ObjectId
        ? restaurant._id
        : new mongoose.Types.ObjectId(restaurant._id);

    logger.info(`â­ Fetching ratings for restaurant:`, {
      restaurantId: restaurantId,
      restaurantObjectId: restaurantIdForRating.toString(),
    });

    const ratingStats = await FeedbackExperience.aggregate([
      {
        $match: {
          restaurantId: restaurantIdForRating,
          rating: { $exists: true, $ne: null, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    logger.info(`â­ Rating stats found:`, ratingStats);

    const averageRating = ratingStats[0]?.averageRating || 0;
    const totalRatings = ratingStats[0]?.totalRatings || 0;

    logger.info(`â­ Calculated ratings:`, {
      averageRating,
      totalRatings,
    });

    // Get unique customers
    const customerStats = await Order.aggregate([
      {
        $match: {
          $or: [
            { restaurantId: restaurantIdString },
            { restaurantId: restaurantIdField },
          ],
          status: "delivered",
        },
      },
      {
        $group: {
          _id: "$userId",
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalCustomers = customerStats.length;
    const repeatCustomers = customerStats.filter(
      (c) => c.orderCount > 1,
    ).length;

    // Calculate average order value
    const averageOrderValue =
      completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // Calculate rates
    const cancellationRate =
      totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;
    const completionRate =
      totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

    // Calculate average yearly profit (if restaurant has been active for multiple years)
    const restaurantCreatedAt = restaurant.createdAt || new Date();
    const yearsActive = Math.max(
      1,
      (now - restaurantCreatedAt) / (365 * 24 * 60 * 60 * 1000),
    );
    const averageYearlyProfit =
      yearsActive > 0
        ? yearlyRestaurantEarning / yearsActive
        : yearlyRestaurantEarning;

    return successResponse(
      res,
      200,
      "Restaurant analytics retrieved successfully",
      {
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          restaurantId: restaurant.restaurantId,
          isActive: restaurant.isActive,
          createdAt: restaurant.createdAt,
        },
        analytics: {
          totalOrders: Number(totalOrders) || 0,
          cancelledOrders: Number(cancelledOrders) || 0,
          completedOrders: Number(completedOrders) || 0,
          averageRating: averageRating
            ? parseFloat(averageRating.toFixed(1))
            : 0,
          totalRatings: Number(totalRatings) || 0,
          commissionPercentage: Number(commissionPercentage) || 0,
          monthlyProfit: parseFloat(monthlyRestaurantEarning.toFixed(2)),
          yearlyProfit: parseFloat(yearlyRestaurantEarning.toFixed(2)),
          averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalCommission: parseFloat(totalCommission.toFixed(2)),
          restaurantEarning: parseFloat(totalRestaurantEarning.toFixed(2)),
          monthlyOrders,
          yearlyOrders,
          averageMonthlyProfit: parseFloat(avgMonthlyProfit.toFixed(2)),
          averageYearlyProfit: parseFloat(averageYearlyProfit.toFixed(2)),
          status: restaurant.isActive ? "active" : "inactive",
          joinDate: restaurant.createdAt,
          totalCustomers,
          repeatCustomers,
          cancellationRate: parseFloat(cancellationRate.toFixed(2)),
          completionRate: parseFloat(completionRate.toFixed(2)),
        },
      },
    );
  } catch (error) {
    logger.error(`Error fetching restaurant analytics: ${error.message}`, {
      error: error.stack,
    });
    return errorResponse(res, 500, "Failed to fetch restaurant analytics");
  }
});

/**
 * Get Customer Wallet Report
 * GET /api/admin/customer-wallet-report
 * Query params: fromDate, toDate, all (Credit/Debit), customer, search
 */
export const getCustomerWalletReport = asyncHandler(async (req, res) => {
  try {
    console.log("ðŸ” Fetching customer wallet report...");
    const { fromDate, toDate, all, customer, search } = req.query;

    console.log("ðŸ“‹ Query params:", {
      fromDate,
      toDate,
      all,
      customer,
      search,
    });

    const UserWallet = (await import("../../user/models/UserWallet.js"))
      .default;
    const User = (await import("../../auth/models/User.js")).default;

    // Build date filter
    let dateFilter = {};
    if (fromDate || toDate) {
      dateFilter["transactions.createdAt"] = {};
      if (fromDate) {
        const startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
        dateFilter["transactions.createdAt"].$gte = startDate;
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        dateFilter["transactions.createdAt"].$lte = endDate;
      }
    }

    // Get all wallets with transactions
    const wallets = await UserWallet.find({
      ...dateFilter,
      "transactions.0": { $exists: true }, // Only wallets with transactions
    })
      .populate("userId", "name email phone")
      .lean();

    // Flatten transactions with user info
    let allTransactions = [];
    wallets.forEach((wallet) => {
      if (!wallet.userId) return;

      // Sort transactions by date (oldest first for balance calculation)
      const sortedTransactions = [...wallet.transactions].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      );

      let runningBalance = 0;

      sortedTransactions.forEach((transaction) => {
        // Update running balance if transaction is completed (before date filter)
        let balance = runningBalance;
        if (transaction.status === "Completed") {
          if (
            transaction.type === "addition" ||
            transaction.type === "refund"
          ) {
            runningBalance += transaction.amount;
            balance = runningBalance;
          } else if (transaction.type === "deduction") {
            runningBalance -= transaction.amount;
            balance = runningBalance;
          }
        }

        // Apply date filter if provided
        if (fromDate || toDate) {
          const transDate = new Date(transaction.createdAt);
          if (fromDate && transDate < new Date(fromDate)) return;
          if (toDate) {
            const toDateObj = new Date(toDate);
            toDateObj.setHours(23, 59, 59, 999);
            if (transDate > toDateObj) return;
          }
        }

        // Map transaction type to frontend format
        let transactionType = "CashBack";
        if (transaction.type === "addition") {
          if (
            transaction.description?.includes("Admin") ||
            transaction.description?.includes("admin")
          ) {
            transactionType = "Add Fund By Admin";
          } else {
            transactionType = "Add Fund";
          }
        } else if (transaction.type === "deduction") {
          transactionType = "Order Payment";
        } else if (transaction.type === "refund") {
          transactionType = "Refund";
        }

        // Get reference
        let reference = "N/A";
        if (transaction.orderId) {
          reference = transaction.orderId.toString();
        } else if (transaction.paymentGateway) {
          reference = transaction.paymentGateway;
        } else if (transaction.description) {
          reference = transaction.description;
        }

        allTransactions.push({
          _id: transaction._id,
          transactionId: transaction._id.toString(),
          customer: wallet.userId.name || "Unknown",
          customerId: wallet.userId._id.toString(),
          credit:
            transaction.type === "addition" || transaction.type === "refund"
              ? transaction.amount
              : 0,
          debit: transaction.type === "deduction" ? transaction.amount : 0,
          balance: balance,
          transactionType: transactionType,
          reference: reference,
          createdAt: transaction.createdAt,
          status: transaction.status,
          type: transaction.type,
        });
      });
    });

    // Filter by transaction type (Credit/Debit)
    if (all && all !== "All") {
      if (all === "Credit") {
        allTransactions = allTransactions.filter((t) => t.credit > 0);
      } else if (all === "Debit") {
        allTransactions = allTransactions.filter((t) => t.debit > 0);
      }
    }

    // Filter by customer
    if (customer && customer !== "Select Customer") {
      allTransactions = allTransactions.filter((t) =>
        t.customer.toLowerCase().includes(customer.toLowerCase()),
      );
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      allTransactions = allTransactions.filter(
        (t) =>
          t.transactionId.toLowerCase().includes(searchLower) ||
          t.customer.toLowerCase().includes(searchLower) ||
          t.reference.toLowerCase().includes(searchLower),
      );
    }

    // Sort by date (newest first)
    allTransactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );

    // Format currency
    const formatCurrency = (amount) => {
      return `â‚¹${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Format date
    const formatDate = (date) => {
      const d = new Date(date);
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
    };

    // Transform transactions for frontend
    const transformedTransactions = allTransactions.map(
      (transaction, index) => ({
        sl: index + 1,
        transactionId: transaction.transactionId,
        customer: transaction.customer,
        credit: formatCurrency(transaction.credit),
        debit: formatCurrency(transaction.debit),
        balance: formatCurrency(transaction.balance),
        transactionType: transaction.transactionType,
        reference: transaction.reference,
        createdAt: formatDate(transaction.createdAt),
      }),
    );

    // Calculate summary statistics
    const totalDebit = allTransactions.reduce((sum, t) => sum + t.debit, 0);
    const totalCredit = allTransactions.reduce((sum, t) => sum + t.credit, 0);
    const totalBalance = totalCredit - totalDebit;

    // Get unique customers for dropdown
    const uniqueCustomers = [
      ...new Set(allTransactions.map((t) => t.customer)),
    ].sort();

    return successResponse(
      res,
      200,
      "Customer wallet report retrieved successfully",
      {
        transactions: transformedTransactions,
        stats: {
          debit: formatCurrency(totalDebit),
          credit: formatCurrency(totalCredit),
          balance: formatCurrency(totalBalance),
        },
        customers: uniqueCustomers,
        pagination: {
          page: 1,
          limit: 10000,
          total: transformedTransactions.length,
          pages: 1,
        },
      },
    );
  } catch (error) {
    console.error("âŒ Error fetching customer wallet report:", error);
    console.error("Error stack:", error.stack);
    return errorResponse(
      res,
      500,
      error.message || "Failed to fetch customer wallet report",
    );
  }
});

/**
 * Get restaurant menu (for Admin)
 * GET /api/admin/restaurants/:restaurantId/menu
 */
export const getRestaurantMenuForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return errorResponse(res, 400, "Invalid restaurant ID format");
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    // Create empty menu if it doesn't exist
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      isActive: true,
    });
    await menu.save();
  }

  return successResponse(res, 200, "Menu retrieved successfully", {
    menu: {
      sections: menu.sections || [],
      isActive: menu.isActive,
    },
  });
});

/**
 * Update restaurant menu (for Admin)
 * PUT /api/admin/restaurants/:restaurantId/menu
 */
export const updateRestaurantMenuForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { sections } = req.body;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return errorResponse(res, 400, "Invalid restaurant ID format");
  }

  const existingMenu = await Menu.findOne({ restaurant: restaurantId });

  const normalizedSections = Array.isArray(sections) ? sections.map((section, index) => {
    const existingSection = existingMenu?.sections?.find(s => s.id === section.id);

    return {
      id: section.id || `section-${index}`,
      name: section.name || "Unnamed Section",
      items: Array.isArray(section.items) ? section.items.map(item => {
        const existingItem = existingSection?.items?.find(i => String(i.id) === String(item.id));

        return {
          id: String(item.id || Date.now() + Math.random()),
          name: item.name || "Unnamed Item",
          nameArabic: item.nameArabic || "",
          image: item.image || "",
          category: item.category || section.name,
          rating: item.rating ?? 0.0,
          reviews: item.reviews ?? 0,
          price: item.price || 0,
          stock: item.stock || "Unlimited",
          discount: item.discount || null,
          originalPrice: item.originalPrice || null,
          foodType: item.foodType || "Non-Veg",
          availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
          availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
          description: item.description || "",
          discountType: item.discountType || "Percent",
          discountAmount: item.discountAmount ?? 0.0,
          isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
          isRecommended: item.isRecommended || false,
          variations: Array.isArray(item.variations) ? item.variations.map(v => ({
            id: String(v.id || Date.now() + Math.random()),
            name: v.name || "",
            price: v.price || 0,
            stock: v.stock || "Unlimited",
          })) : [],
          tags: Array.isArray(item.tags) ? item.tags : [],
          nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
          allergies: Array.isArray(item.allergies) ? item.allergies : [],
          photoCount: item.photoCount ?? 1,
          subCategory: item.subCategory || "",
          servesInfo: item.servesInfo || "",
          itemSize: item.itemSize || "",
          itemSizeQuantity: item.itemSizeQuantity || "",
          itemSizeUnit: item.itemSizeUnit || "piece",
          gst: item.gst ?? 0,
          preparationTime: item.preparationTime || existingItem?.preparationTime || "",
          images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
          approvalStatus: 'approved', 
          approvedAt: existingItem?.approvedAt || new Date(),
          approvedBy: req.user._id,
        };
      }) : [],
      subsections: Array.isArray(section.subsections) ? section.subsections.map(subsection => {
        const existingSubsection = existingSection?.subsections?.find(s => s.id === subsection.id);

        return {
          id: subsection.id || `subsection-${Date.now()}`,
          name: subsection.name || "Unnamed Subsection",
          items: Array.isArray(subsection.items) ? subsection.items.map(item => {
            const existingItem = existingSubsection?.items?.find(i => String(i.id) === String(item.id));

            return {
              id: String(item.id || Date.now() + Math.random()),
              name: item.name || "Unnamed Item",
              nameArabic: item.nameArabic || "",
              image: item.image || "",
              category: item.category || section.name,
              rating: item.rating ?? 0.0,
              reviews: item.reviews ?? 0,
              price: item.price || 0,
              stock: item.stock || "Unlimited",
              discount: item.discount || null,
              originalPrice: item.originalPrice || null,
              foodType: item.foodType || "Non-Veg",
              availabilityTimeStart: item.availabilityTimeStart || "12:01 AM",
              availabilityTimeEnd: item.availabilityTimeEnd || "11:57 PM",
              description: item.description || "",
              discountType: item.discountType || "Percent",
              discountAmount: item.discountAmount ?? 0.0,
              isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
              isRecommended: item.isRecommended || false,
              variations: Array.isArray(item.variations) ? item.variations.map(v => ({
                id: String(v.id || Date.now() + Math.random()),
                name: v.name || "",
                price: v.price || 0,
                stock: v.stock || "Unlimited",
              })) : [],
              tags: Array.isArray(item.tags) ? item.tags : [],
              nutrition: Array.isArray(item.nutrition) ? item.nutrition : [],
              allergies: Array.isArray(item.allergies) ? item.allergies : [],
              photoCount: item.photoCount ?? 1,
              subCategory: item.subCategory || "",
              servesInfo: item.servesInfo || "",
              itemSize: item.itemSize || "",
              itemSizeQuantity: item.itemSizeQuantity || "",
              itemSizeUnit: item.itemSizeUnit || "piece",
              gst: item.gst ?? 0,
              preparationTime: item.preparationTime || existingItem?.preparationTime || "",
              images: Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []),
              approvalStatus: 'approved',
              approvedAt: existingItem?.approvedAt || new Date(),
              approvedBy: req.user._id,
            };
          }) : [],
        };
      }) : [],
      isEnabled: section.isEnabled !== undefined ? section.isEnabled : true,
      order: section.order !== undefined ? section.order : index,
    };
  }) : [];

  const updatedMenu = await Menu.findOneAndUpdate(
    { restaurant: restaurantId },
    { 
      $set: { 
        sections: normalizedSections,
        isActive: true
      } 
    },
    { new: true, upsert: true }
  );

  return successResponse(res, 200, "Menu updated successfully by admin", {
    menu: {
      sections: updatedMenu.sections,
      isActive: updatedMenu.isActive,
    },
  });
});

/**
 * Create add-on for a restaurant (Admin)
 * POST /api/admin/restaurants/:restaurantId/addons
 */
export const createAddonForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { name, description, price, image, images } = req.body;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return errorResponse(res, 400, 'Invalid restaurant ID format');
  }

  if (!name || !name.trim()) {
    return errorResponse(res, 400, 'Add-on name is required');
  }

  // Find or create menu
  let menu = await Menu.findOne({ restaurant: restaurantId });

  if (!menu) {
    menu = new Menu({
      restaurant: restaurantId,
      sections: [],
      addons: [],
      isActive: true,
    });
  }

  const normalizedImages = Array.isArray(images) && images.length > 0
    ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
    : (image && image.trim() !== '' ? [image] : []);

  const newAddon = {
    id: `addon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    description: description || '',
    price: Number(price) || 0,
    image: normalizedImages.length > 0 ? normalizedImages[0] : '',
    images: normalizedImages,
    isAvailable: true,
    approvalStatus: 'approved', // Admin added add-ons are approved by default
    approvedAt: new Date(),
    approvedBy: req.user._id,
    requestedAt: new Date(),
  };

  if (!menu.addons) menu.addons = [];
  menu.addons.push(newAddon);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 201, 'Add-on added successfully by admin', {
    addon: newAddon,
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

/**
 * Update add-on for a restaurant (Admin)
 * PUT /api/admin/restaurants/:restaurantId/addons/:addonId
 */
export const updateAddonForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId, addonId } = req.params;
  const { name, description, price, image, images, isAvailable } = req.body;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return errorResponse(res, 400, 'Invalid restaurant ID format');
  }

  const menu = await Menu.findOne({ restaurant: restaurantId });
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(addonId));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  const addon = menu.addons[addonIndex];

  if (typeof isAvailable === 'boolean') {
    addon.isAvailable = isAvailable;
  }

  if (name) addon.name = name.trim();
  if (description !== undefined) addon.description = description || '';
  if (price !== undefined) addon.price = Number(price) || 0;
  
  if (images || image) {
    const normalizedImages = Array.isArray(images) && images.length > 0
      ? images.filter(img => img && typeof img === 'string' && img.trim() !== '')
      : (image && image.trim() !== '' ? [image] : []);
    
    addon.images = normalizedImages;
    addon.image = normalizedImages.length > 0 ? normalizedImages[0] : '';
  }

  addon.approvalStatus = 'approved';
  addon.approvedAt = new Date();
  addon.approvedBy = req.user._id;

  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on updated successfully by admin', {
    addon: menu.addons[addonIndex],
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});

/**
 * Delete add-on for a restaurant (Admin)
 * DELETE /api/admin/restaurants/:restaurantId/addons/:addonId
 */
export const deleteAddonForAdmin = asyncHandler(async (req, res) => {
  const { restaurantId, addonId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    return errorResponse(res, 400, 'Invalid restaurant ID format');
  }

  const menu = await Menu.findOne({ restaurant: restaurantId });
  if (!menu) {
    return errorResponse(res, 404, 'Menu not found');
  }

  const addonIndex = menu.addons.findIndex(a => String(a.id) === String(addonId));
  if (addonIndex === -1) {
    return errorResponse(res, 404, 'Add-on not found');
  }

  menu.addons.splice(addonIndex, 1);
  menu.markModified('addons');
  await menu.save();

  return successResponse(res, 200, 'Add-on deleted successfully by admin', {
    menu: {
      addons: menu.addons,
      isActive: menu.isActive,
    },
  });
});
