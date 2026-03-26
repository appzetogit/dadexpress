import OrderSettlement from '../models/OrderSettlement.js';
import RestaurantWallet from '../../restaurant/models/RestaurantWallet.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import mongoose from 'mongoose';

const buildDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getOrderDeliveredAt = (order) => {
  if (!order) return null;
  return order.deliveredAt || order?.tracking?.delivered?.timestamp || null;
};

/**
 * Effective delivery timestamp for reporting when deliveredAt / tracking is missing (legacy orders).
 */
const getReportDeliveryTimestamp = (order, settlement) => {
  if (!order || order.status !== 'delivered') return null;
  const direct = getOrderDeliveredAt(order);
  if (direct) return new Date(direct);
  if (order.updatedAt) return new Date(order.updatedAt);
  if (settlement?.createdAt) return new Date(settlement.createdAt);
  return null;
};

/**
 * Admin restaurant finance report rows: delivered orders with settlement (DB).
 * Escrow often sets restaurantSettled=true already, so we do NOT filter by restaurantSettled.
 * Rows hidden after "Mark as Paid" via metadata.restaurantFinanceReportMarked === true.
 */
export const getPendingRestaurantSettlements = async (restaurantId = null, startDate = null, endDate = null) => {
  try {
    const query = {
      settlementStatus: { $nin: ['cancelled'] },
      'restaurantEarning.status': { $nin: ['cancelled'] },
      'metadata.restaurantFinanceReportMarked': { $ne: true },
    };

    if (restaurantId) {
      query.restaurantId = restaurantId;
    }

    const dateRange = buildDateRange(startDate, endDate);

    const settlementsRaw = await OrderSettlement.find(query)
      .populate('orderId', 'orderId status deliveredAt tracking updatedAt')
      .populate('restaurantId', 'name restaurantId')
      .sort({ createdAt: -1 })
      .lean();

    const settlements = settlementsRaw.filter((settlement) => {
      const meta = settlement?.metadata;
      const hidden =
        meta &&
        (meta.restaurantFinanceReportMarked === true ||
          (typeof meta.get === 'function' && meta.get('restaurantFinanceReportMarked') === true));
      if (hidden) return false;
      const order = settlement?.orderId;
      if (!order || order.status !== 'delivered') return false;
      if (!dateRange) return true;
      const dt = getReportDeliveryTimestamp(order, settlement);
      if (!dt || Number.isNaN(dt.getTime())) return false;
      return dt >= dateRange.start && dt <= dateRange.end;
    });

    return settlements;
  } catch (error) {
    console.error('Error getting pending restaurant settlements:', error);
    throw error;
  }
};

/**
 * Get pending settlements for delivery partners
 */
export const getPendingDeliverySettlements = async (deliveryId = null, startDate = null, endDate = null) => {
  try {
    const query = {
      'deliveryPartnerEarning.status': 'credited',
      deliveryPartnerSettled: false,
      settlementStatus: 'completed',
      deliveryPartnerId: { $ne: null },
      'metadata.deliveryFinanceReportMarked': { $ne: true },
    };

    if (deliveryId) {
      query.deliveryPartnerId = deliveryId;
    }

    const dateRange = buildDateRange(startDate, endDate);

    const settlementsRaw = await OrderSettlement.find(query)
      .populate('orderId', 'orderId status deliveredAt tracking updatedAt')
      .populate('deliveryPartnerId', 'name phone')
      .sort({ createdAt: -1 })
      .lean();

    const settlements = settlementsRaw.filter((settlement) => {
      const meta = settlement?.metadata;
      const hidden =
        meta &&
        (meta.deliveryFinanceReportMarked === true ||
          (typeof meta.get === 'function' && meta.get('deliveryFinanceReportMarked') === true));
      if (hidden) return false;
      const order = settlement?.orderId;
      if (!order || order.status !== 'delivered') return false;
      if (!dateRange) return true;
      const dt = getReportDeliveryTimestamp(order, settlement);
      if (!dt || Number.isNaN(dt.getTime())) return false;
      return dt >= dateRange.start && dt <= dateRange.end;
    });

    return settlements;
  } catch (error) {
    console.error('Error getting pending delivery settlements:', error);
    throw error;
  }
};

/**
 * Generate restaurant settlement report for restaurants (daily/weekly)
 */
export const generateRestaurantSettlementReport = async (restaurantId, startDate, endDate) => {
  try {
    const dateRange = buildDateRange(startDate, endDate);
    const settlementsRaw = await OrderSettlement.find({
      restaurantId: restaurantId,
      'restaurantEarning.status': 'credited'
    })
      .populate('orderId', 'orderId status deliveredAt tracking')
      .sort({ createdAt: -1 })
      .lean();

    const settlements = settlementsRaw.filter((settlement) => {
      const order = settlement?.orderId;
      if (!order || order.status !== 'delivered') return false;
      if (!dateRange) return true;
      const deliveredAt = getOrderDeliveredAt(order);
      if (!deliveredAt) return false;
      const deliveredAtDate = new Date(deliveredAt);
      if (Number.isNaN(deliveredAtDate.getTime())) return false;
      return deliveredAtDate >= dateRange.start && deliveredAtDate <= dateRange.end;
    });

    const totalEarnings = settlements.reduce((sum, s) => sum + s.restaurantEarning.netEarning, 0);
    const totalOrders = settlements.length;
    const totalCommission = settlements.reduce((sum, s) => sum + s.restaurantEarning.commission, 0);

    return {
      restaurantId,
      period: {
        startDate,
        endDate
      },
      summary: {
        totalOrders,
        totalEarnings,
        totalCommission,
        averageOrderValue: totalOrders > 0 ? totalEarnings / totalOrders : 0
      },
      settlements: settlements.map(s => ({
        orderNumber: s.orderNumber,
        orderDate: s.createdAt,
        foodPrice: s.restaurantEarning.foodPrice,
        commission: s.restaurantEarning.commission,
        netEarning: s.restaurantEarning.netEarning,
        status: s.restaurantEarning.status
      }))
    };
  } catch (error) {
    console.error('Error generating restaurant settlement report:', error);
    throw error;
  }
};

/**
 * Generate settlement report for delivery partners (weekly)
 */
export const generateDeliverySettlementReport = async (deliveryId, startDate, endDate) => {
  try {
    const dateRange = buildDateRange(startDate, endDate);
    const settlementsRaw = await OrderSettlement.find({
      deliveryPartnerId: deliveryId,
      'deliveryPartnerEarning.status': 'credited'
    })
      .populate('orderId', 'orderId status deliveredAt tracking')
      .sort({ createdAt: -1 })
      .lean();

    const settlements = settlementsRaw.filter((settlement) => {
      const order = settlement?.orderId;
      if (!order || order.status !== 'delivered') return false;
      if (!dateRange) return true;
      const deliveredAt = getOrderDeliveredAt(order);
      if (!deliveredAt) return false;
      const deliveredAtDate = new Date(deliveredAt);
      if (Number.isNaN(deliveredAtDate.getTime())) return false;
      return deliveredAtDate >= dateRange.start && deliveredAtDate <= dateRange.end;
    });

    const totalEarnings = settlements.reduce((sum, s) => sum + s.deliveryPartnerEarning.totalEarning, 0);
    const totalOrders = settlements.length;
    const totalDistance = settlements.reduce((sum, s) => sum + (s.deliveryPartnerEarning.distance || 0), 0);
    const totalBasePayout = settlements.reduce((sum, s) => sum + s.deliveryPartnerEarning.basePayout, 0);
    const totalDistanceCommission = settlements.reduce((sum, s) => sum + s.deliveryPartnerEarning.distanceCommission, 0);
    const totalSurge = settlements.reduce((sum, s) => sum + s.deliveryPartnerEarning.surgeAmount, 0);

    return {
      deliveryId,
      period: {
        startDate,
        endDate
      },
      summary: {
        totalOrders,
        totalEarnings,
        totalDistance: totalDistance.toFixed(2),
        totalBasePayout,
        totalDistanceCommission,
        totalSurge,
        averageEarningPerOrder: totalOrders > 0 ? totalEarnings / totalOrders : 0
      },
      settlements: settlements.map(s => ({
        orderNumber: s.orderNumber,
        orderDate: s.createdAt,
        distance: s.deliveryPartnerEarning.distance,
        basePayout: s.deliveryPartnerEarning.basePayout,
        distanceCommission: s.deliveryPartnerEarning.distanceCommission,
        surgeAmount: s.deliveryPartnerEarning.surgeAmount,
        totalEarning: s.deliveryPartnerEarning.totalEarning,
        status: s.deliveryPartnerEarning.status
      }))
    };
  } catch (error) {
    console.error('Error generating delivery settlement report:', error);
    throw error;
  }
};

/**
 * Mark settlements as processed (for weekly payouts)
 */
export const markSettlementsAsProcessed = async (settlementIds, actorType, actorId) => {
  try {
    const settlements = await OrderSettlement.find({
      _id: { $in: settlementIds }
    });

    for (const settlement of settlements) {
      if (!settlement.metadata || !(settlement.metadata instanceof Map)) {
        const plain =
          settlement.metadata && typeof settlement.metadata === 'object' && !(settlement.metadata instanceof Map)
            ? { ...settlement.metadata }
            : {};
        settlement.metadata = new Map(Object.entries(plain));
      }

      // Mark for both reports to be safe if applicable
      settlement.metadata.set('restaurantFinanceReportMarked', true);
      settlement.metadata.set('deliveryFinanceReportMarked', true);

      if (settlement.restaurantEarning.status === 'credited' && !settlement.restaurantSettled) {
        settlement.restaurantSettled = true;
      }
      if (settlement.deliveryPartnerEarning.status === 'credited' && !settlement.deliveryPartnerSettled) {
        settlement.deliveryPartnerSettled = true;
      }
      await settlement.save();
    }

    return settlements;
  } catch (error) {
    console.error('Error marking settlements as processed:', error);
    throw error;
  }
};

