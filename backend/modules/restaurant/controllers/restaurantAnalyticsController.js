import Order from '../../order/models/Order.js';
import Offer from '../models/Offer.js';
import mongoose from 'mongoose';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import asyncHandler from '../../../shared/middleware/asyncHandler.js';

const DEFAULT_BUCKETS = ["12am", "4am", "8am", "12pm", "4pm", "8pm"];

const getRestaurantIdQuery = (restaurantId) => {
  const restaurantIdString = restaurantId?._id?.toString?.() || restaurantId?.toString?.() || String(restaurantId);
  const variations = [restaurantIdString];

  if (mongoose.Types.ObjectId.isValid(restaurantIdString)) {
    const objectIdString = new mongoose.Types.ObjectId(restaurantIdString).toString();
    if (!variations.includes(objectIdString)) {
      variations.push(objectIdString);
    }
  }

  return {
    $or: [
      { restaurantId: { $in: variations } },
      { restaurantId: restaurantIdString }
    ]
  };
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const resolveDateRange = (query = {}) => {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (query.startDate && query.endDate) {
    return {
      startDate: startOfDay(new Date(query.startDate)),
      endDate: endOfDay(new Date(query.endDate)),
      rangeKey: query.range || 'custom'
    };
  }

  switch (query.range) {
    case 'today':
      return { startDate: today, endDate: endOfDay(today), rangeKey: 'today' };
    case 'thisWeek': {
      const currentDay = now.getDay();
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
      const currentDate = new Date(now);
      const startDate = startOfDay(new Date(currentDate.setDate(currentDate.getDate() - daysFromMonday)));
      const endDate = endOfDay(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6));
      return { startDate, endDate, rangeKey: 'thisWeek' };
    }
    case 'lastWeek': {
      const currentDay = now.getDay();
      const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
      const currentDate = new Date(now);
      const thisWeekStart = startOfDay(new Date(currentDate.setDate(currentDate.getDate() - daysFromMonday)));
      const startDate = startOfDay(new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - 7));
      const endDate = endOfDay(new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - 1));
      return { startDate, endDate, rangeKey: 'lastWeek' };
    }
    case 'thisMonth': {
      const startDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const endDate = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { startDate, endDate, rangeKey: 'thisMonth' };
    }
    case 'lastMonth': {
      const startDate = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      const endDate = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { startDate, endDate, rangeKey: 'lastMonth' };
    }
    case 'last5days': {
      const startDate = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4));
      return { startDate, endDate: endOfDay(today), rangeKey: 'last5days' };
    }
    case 'yesterday':
    default:
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday), rangeKey: 'yesterday' };
  }
};

const getOrderEventDate = (order) => {
  return (
    order?.deliveredAt ||
    order?.tracking?.delivered?.timestamp ||
    order?.createdAt ||
    null
  );
};

const calculatePercentageChange = (current, previous) => {
  const safeCurrent = Number(current) || 0;
  const safePrevious = Number(previous) || 0;
  if (safePrevious === 0) {
    return safeCurrent > 0 ? 100 : 0;
  }
  return Number((((safeCurrent - safePrevious) / safePrevious) * 100).toFixed(1));
};

const formatMetricChange = (current, previous, suffix = '%') => {
  const pct = calculatePercentageChange(current, previous);
  return `${pct >= 0 ? '' : '-'}${Math.abs(pct)}${suffix}`;
};

const getOfferAppliedOrders = (orders) =>
  orders.filter((order) => {
    const couponCode = order?.pricing?.couponCode;
    const discount = Number(order?.pricing?.discount) || 0;
    return Boolean(couponCode) || discount > 0;
  });

const classifyCustomersForPeriod = (ordersInPeriod, priorOrders, periodStartDate) => {
  const latestPriorByUser = new Map();

  priorOrders.forEach((order) => {
    const userId = order?.userId?.toString?.() || order?.userId;
    const eventDate = getOrderEventDate(order);
    if (!userId || !eventDate) return;
    const existing = latestPriorByUser.get(String(userId));
    if (!existing || eventDate > existing) {
      latestPriorByUser.set(String(userId), new Date(eventDate));
    }
  });

  const uniqueCurrentUsers = new Set(
    ordersInPeriod
      .map((order) => order?.userId?.toString?.() || order?.userId)
      .filter(Boolean)
      .map(String)
  );

  const counters = {
    newCustomers: 0,
    repeatCustomers: 0,
    lapsedCustomers: 0
  };

  uniqueCurrentUsers.forEach((userId) => {
    const lastOrderDate = latestPriorByUser.get(userId);
    if (!lastOrderDate) {
      counters.newCustomers += 1;
      return;
    }

    const diffInDays = Math.floor((periodStartDate.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffInDays <= 60) {
      counters.repeatCustomers += 1;
    } else if (diffInDays <= 365) {
      counters.lapsedCustomers += 1;
    } else {
      counters.newCustomers += 1;
    }
  });

  return counters;
};

const buildChartData = (orders) => {
  const buckets = {
    "12am": { orders: 0, sales: 0 },
    "4am": { orders: 0, sales: 0 },
    "8am": { orders: 0, sales: 0 },
    "12pm": { orders: 0, sales: 0 },
    "4pm": { orders: 0, sales: 0 },
    "8pm": { orders: 0, sales: 0 }
  };

  orders.forEach((order) => {
    const eventDate = getOrderEventDate(order);
    if (!eventDate) return;

    const hour = new Date(eventDate).getHours();
    let bucketKey = "8pm";
    if (hour < 4) bucketKey = "12am";
    else if (hour < 8) bucketKey = "4am";
    else if (hour < 12) bucketKey = "8am";
    else if (hour < 16) bucketKey = "12pm";
    else if (hour < 20) bucketKey = "4pm";

    const saleAmount = Number(order?.pricing?.total) || 0;
    buckets[bucketKey].orders += 1;
    buckets[bucketKey].sales += saleAmount;
  });

  return DEFAULT_BUCKETS.map((bucket) => ({
    hour: bucket,
    orders: buckets[bucket].orders,
    sales: Math.round(buckets[bucket].sales * 100) / 100
  }));
};

const buildMealtimeMetrics = (orders) => {
  const slots = {
    breakfast: { count: 0, title: "Breakfast", window: "7:00 am - 11:00 am", color: "#111827" },
    lunch: { count: 0, title: "Lunch", window: "11:00 am - 4:00 pm", color: "#ef4444" },
    evening: { count: 0, title: "Evening snacks", window: "4:00 pm - 7:00 pm", color: "#2563eb" },
    dinner: { count: 0, title: "Dinner", window: "7:00 pm - 11:00 pm", color: "#f59e0b" },
    lateNight: { count: 0, title: "Late night", window: "11:00 pm - 7:00 am", color: "#10b981" }
  };

  orders.forEach((order) => {
    const eventDate = getOrderEventDate(order);
    if (!eventDate) return;
    const date = new Date(eventDate);
    const minutes = date.getHours() * 60 + date.getMinutes();

    if (minutes >= 420 && minutes < 660) slots.breakfast.count += 1;
    else if (minutes >= 660 && minutes < 960) slots.lunch.count += 1;
    else if (minutes >= 960 && minutes < 1140) slots.evening.count += 1;
    else if (minutes >= 1140 && minutes < 1380) slots.dinner.count += 1;
    else slots.lateNight.count += 1;
  });

  const total = orders.length;
  return Object.values(slots).map((slot) => ({
    title: slot.title,
    window: slot.window,
    value: String(slot.count),
    change: `${total > 0 ? ((slot.count / total) * 100).toFixed(1) : "0.0"}%`,
    color: slot.color
  }));
};

export const getRestaurantAnalytics = asyncHandler(async (req, res) => {
  try {
    const restaurant = req.restaurant;
    if (!restaurant?._id) {
      return errorResponse(res, 401, 'Restaurant authentication required');
    }

    const { startDate, endDate, rangeKey } = resolveDateRange(req.query);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return errorResponse(res, 400, 'Invalid date range');
    }

    const rangeLengthMs = endDate.getTime() - startDate.getTime() + 1;
    const previousEndDate = new Date(startDate.getTime() - 1);
    const previousStartDate = new Date(startDate.getTime() - rangeLengthMs);

    const orders = await Order.find({
      status: { $ne: 'cancelled' },
      $and: [
        getRestaurantIdQuery(restaurant._id),
        {
          $or: [
            { deliveredAt: { $gte: previousStartDate, $lte: endDate } },
            { 'tracking.delivered.timestamp': { $gte: previousStartDate, $lte: endDate } },
            { createdAt: { $gte: previousStartDate, $lte: endDate } }
          ]
        }
      ]
    })
      .select('userId pricing createdAt deliveredAt tracking')
      .lean();

    const currentOrders = orders.filter((order) => {
      const eventDate = getOrderEventDate(order);
      if (!eventDate) return false;
      const time = new Date(eventDate).getTime();
      return time >= startDate.getTime() && time <= endDate.getTime();
    });

    const previousOrders = orders.filter((order) => {
      const eventDate = getOrderEventDate(order);
      if (!eventDate) return false;
      const time = new Date(eventDate).getTime();
      return time >= previousStartDate.getTime() && time <= previousEndDate.getTime();
    });

    const currentNetSales = currentOrders.reduce((sum, order) => sum + (Number(order?.pricing?.total) || 0), 0);
    const previousNetSales = previousOrders.reduce((sum, order) => sum + (Number(order?.pricing?.total) || 0), 0);
    const currentTotalOrders = currentOrders.length;
    const previousTotalOrders = previousOrders.length;
    const currentAov = currentTotalOrders > 0 ? currentNetSales / currentTotalOrders : 0;
    const previousAov = previousTotalOrders > 0 ? previousNetSales / previousTotalOrders : 0;

    const currentUserIds = [...new Set(currentOrders.map((order) => order?.userId?.toString?.() || order?.userId).filter(Boolean).map(String))];
    const previousUserIds = [...new Set(previousOrders.map((order) => order?.userId?.toString?.() || order?.userId).filter(Boolean).map(String))];
    const allUserIds = [...new Set([...currentUserIds, ...previousUserIds])];

    let priorOrdersBeforeCurrent = [];
    let priorOrdersBeforePrevious = [];

    if (allUserIds.length > 0) {
      const priorOrders = await Order.find({
        status: { $ne: 'cancelled' },
        userId: { $in: allUserIds },
        $and: [
          getRestaurantIdQuery(restaurant._id),
          {
            $or: [
              { deliveredAt: { $lt: startDate } },
              { 'tracking.delivered.timestamp': { $lt: startDate } },
              { createdAt: { $lt: startDate } }
            ]
          }
        ]
      })
        .select('userId createdAt deliveredAt tracking')
        .lean();

      priorOrdersBeforeCurrent = priorOrders.filter((order) => {
        const eventDate = getOrderEventDate(order);
        return eventDate && eventDate < startDate;
      });

      priorOrdersBeforePrevious = priorOrders.filter((order) => {
        const eventDate = getOrderEventDate(order);
        return eventDate && eventDate < previousStartDate;
      });
    }

    const currentCustomerStats = classifyCustomersForPeriod(currentOrders, priorOrdersBeforeCurrent, startDate);
    const previousCustomerStats = classifyCustomersForPeriod(previousOrders, priorOrdersBeforePrevious, previousStartDate);

    const currentOfferOrders = getOfferAppliedOrders(currentOrders);
    const previousOfferOrders = getOfferAppliedOrders(previousOrders);

    const currentOfferRedemptions = currentOfferOrders.length;
    const previousOfferRedemptions = previousOfferOrders.length;
    const currentDiscountGiven = currentOfferOrders.reduce((sum, order) => sum + (Number(order?.pricing?.discount) || 0), 0);
    const previousDiscountGiven = previousOfferOrders.reduce((sum, order) => sum + (Number(order?.pricing?.discount) || 0), 0);

    const activeOffers = await Offer.countDocuments({
      restaurant: restaurant._id,
      status: 'active',
      startDate: { $lte: endDate },
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: startDate } }
      ]
    });

    const previousActiveOffers = await Offer.countDocuments({
      restaurant: restaurant._id,
      status: 'active',
      startDate: { $lte: previousEndDate },
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gte: previousStartDate } }
      ]
    });

    const currentOfferClicks = currentOfferRedemptions;
    const previousOfferClicks = previousOfferRedemptions;
    const currentConversionRate = currentOfferClicks > 0 ? (currentOfferRedemptions / currentOfferClicks) * 100 : 0;
    const previousConversionRate = previousOfferClicks > 0 ? (previousOfferRedemptions / previousOfferClicks) * 100 : 0;
    const currentCostPerRedemption = currentOfferRedemptions > 0 ? currentDiscountGiven / currentOfferRedemptions : 0;
    const previousCostPerRedemption = previousOfferRedemptions > 0 ? previousDiscountGiven / previousOfferRedemptions : 0;

    return successResponse(res, 200, 'Restaurant analytics retrieved successfully', {
      summary: {
        netSales: Math.round(currentNetSales * 100) / 100,
        totalOrders: currentTotalOrders,
        avgOrderValue: Math.round(currentAov * 100) / 100,
        salesChangePct: calculatePercentageChange(currentNetSales, previousNetSales),
        ordersChangePct: calculatePercentageChange(currentTotalOrders, previousTotalOrders),
        aovChangePct: calculatePercentageChange(currentAov, previousAov),
        lastUpdatedAt: new Date().toISOString()
      },
      chartData: buildChartData(currentOrders),
      mealtimeMetrics: buildMealtimeMetrics(currentOrders),
      customers: {
        metrics: [
          {
            title: 'New customers',
            sub: 'No orders in last 365 days',
            value: String(currentCustomerStats.newCustomers),
            change: formatMetricChange(currentCustomerStats.newCustomers, previousCustomerStats.newCustomers),
            color: '#111827'
          },
          {
            title: 'Repeat customers',
            sub: 'Ordered in last 60 days',
            value: String(currentCustomerStats.repeatCustomers),
            change: formatMetricChange(currentCustomerStats.repeatCustomers, previousCustomerStats.repeatCustomers),
            color: '#ef4444'
          },
          {
            title: 'Lapsed customers',
            sub: 'Last order 60 to 365 days ago',
            value: String(currentCustomerStats.lapsedCustomers),
            change: formatMetricChange(currentCustomerStats.lapsedCustomers, previousCustomerStats.lapsedCustomers),
            color: '#2563eb'
          }
        ]
      },
      offers: {
        metrics: [
          {
            title: 'Offer clicks',
            value: String(currentOfferClicks),
            change: formatMetricChange(currentOfferClicks, previousOfferClicks),
            sub: 'Clicks on offers'
          },
          {
            title: 'Offer redemptions',
            value: String(currentOfferRedemptions),
            change: formatMetricChange(currentOfferRedemptions, previousOfferRedemptions),
            sub: 'Total redeemed'
          },
          {
            title: 'Conversion rate',
            value: `${Math.round(currentConversionRate * 10) / 10}%`,
            change: formatMetricChange(currentConversionRate, previousConversionRate),
            sub: 'Redemptions / clicks'
          },
          {
            title: 'Cost per redemption',
            value: `₹${(Math.round(currentCostPerRedemption * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`,
            change: formatMetricChange(currentCostPerRedemption, previousCostPerRedemption),
            sub: 'Est. cost'
          }
        ],
        activeOffers,
        previousActiveOffers,
        totalDiscountGiven: Math.round(currentDiscountGiven * 100) / 100
      },
      range: {
        key: rangeKey,
        startDate,
        endDate
      }
    });
  } catch (error) {
    console.error('Error fetching restaurant analytics:', error);
    return errorResponse(res, 500, 'Failed to fetch restaurant analytics');
  }
});


