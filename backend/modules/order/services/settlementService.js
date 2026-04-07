import OrderSettlement from '../models/OrderSettlement.js';
import Order from '../models/Order.js';
import RestaurantWallet from '../../restaurant/models/RestaurantWallet.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import { calculateOrderSettlement } from './orderSettlementService.js';
import mongoose from 'mongoose';
import { notifyRestaurantPayoutProcessing } from './restaurantNotificationService.js';

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

const readMetaValue = (meta, key) => {
  if (!meta) return undefined;
  if (typeof meta.get === 'function') return meta.get(key);
  return meta[key];
};

/**
 * Admin restaurant finance report rows: delivered orders with settlement (DB).
 * Escrow often sets restaurantSettled=true already, so we do NOT filter by restaurantSettled.
 * View modes:
 * - pending: only non-marked rows (default)
 * - history: only marked rows
 * - all: all rows
 */
export const getPendingRestaurantSettlements = async (restaurantId = null, startDate = null, endDate = null, view = 'pending') => {
  try {
    const dateRange = buildDateRange(startDate, endDate);
    
    // 1. Find delivered orders first (Source of Truth)
    const orderQuery = { status: 'delivered' };
    if (restaurantId) orderQuery.restaurantId = restaurantId;
    
    // If date range is provided, filter by deliveredAt or updatedAt
    if (dateRange) {
      orderQuery.$or = [
        { deliveredAt: { $gte: dateRange.start, $lte: dateRange.end } },
        { updatedAt: { $gte: dateRange.start, $lte: dateRange.end } }
      ];
    }

    const orders = await Order.find(orderQuery).select('_id orderId restaurantId restaurantName status deliveredAt updatedAt').lean();
    const orderIds = orders.map(o => o._id);

    // 2. Find/Ensure settlements exist for these orders
    // Use an aggressive check to ensure we have data
    const settlements = [];
    for (const order of orders) {
      let settlement = await OrderSettlement.findOne({ orderId: order._id })
        .populate('orderId', 'orderId status deliveredAt tracking updatedAt pricing')
        .populate('restaurantId', 'name restaurantId')
        .lean();

      // Auto-create if missing (Permanent Fix for data gaps)
      if (!settlement) {
        try {
          const newDoc = await calculateOrderSettlement(order._id);
          settlement = await OrderSettlement.findById(newDoc._id)
            .populate('orderId', 'orderId status deliveredAt tracking updatedAt pricing')
            .populate('restaurantId', 'name restaurantId')
            .lean();
        } catch (calcErr) {
          console.error(`Failed to auto-create settlement for order ${order.orderId}:`, calcErr.message);
          continue;
        }
      }

      // 3. Filter by paid/hidden status
      const isMarked = readMetaValue(settlement?.metadata, 'restaurantFinanceReportMarked') === true;
      const includeRecord =
        (view === 'history' && isMarked) ||
        (view === 'all') ||
        (view !== 'history' && !isMarked);

      if (includeRecord && settlement.settlementStatus !== 'cancelled') settlements.push(settlement);
    }

    // Sort by delivery date descending
    return settlements.sort((a, b) => {
      const dateA = getReportDeliveryTimestamp(a.orderId, a);
      const dateB = getReportDeliveryTimestamp(b.orderId, b);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
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
    const dateRange = buildDateRange(startDate, endDate);
    
    // 1. Find delivered orders first (Source of Truth)
    const orderQuery = { 
      status: 'delivered',
      deliveryPartnerId: { $ne: null } 
    };
    
    if (deliveryId) {
      orderQuery.deliveryPartnerId = deliveryId;
    }
    
    if (dateRange) {
      orderQuery.$or = [
        { deliveredAt: { $gte: dateRange.start, $lte: dateRange.end } },
        { updatedAt: { $gte: dateRange.start, $lte: dateRange.end } }
      ];
    }

    const orders = await Order.find(orderQuery).select('_id orderId deliveryPartnerId status deliveredAt updatedAt').lean();
    
    const settlements = [];
    for (const order of orders) {
      let settlement = await OrderSettlement.findOne({ orderId: order._id })
        .populate('orderId', 'orderId status deliveredAt tracking updatedAt selectionDetails pricing')
        .populate('deliveryPartnerId', 'name phone')
        .lean();

      // Auto-create if missing OR force recalculate if earning is 0
      const currentEarning = settlement?.deliveryPartnerEarning?.totalEarning || 0;
      if (!settlement || (currentEarning === 0 && order.status === 'delivered')) {
        try {
          const newDoc = await calculateOrderSettlement(order._id);
          settlement = await OrderSettlement.findById(newDoc._id)
            .populate('orderId', 'orderId status deliveredAt tracking updatedAt selectionDetails pricing')
            .populate('deliveryPartnerId', 'name phone')
            .lean();
        } catch (calcErr) {
          console.error(`Failed to repair delivery settlement for order ${order.orderId}:`, calcErr.message);
          if (!settlement) continue;
        }
      }

      // Check if hidden
      const meta = settlement?.metadata;
      let isHidden = false;
      if (meta) {
        if (typeof meta.get === 'function') {
          isHidden = meta.get('deliveryFinanceReportMarked') === true;
        } else {
          isHidden = meta.deliveryFinanceReportMarked === true;
        }
      }

      if (!isHidden && settlement.settlementStatus !== 'cancelled') {
        settlements.push(settlement);
      }
    }

    // Sort by delivery date descending
    return settlements.sort((a, b) => {
      const dateA = getReportDeliveryTimestamp(a.orderId, a);
      const dateB = getReportDeliveryTimestamp(b.orderId, b);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
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

    const restaurantPayouts = new Map();

    for (const settlement of settlements) {
      if (!settlement.metadata || !(settlement.metadata instanceof Map)) {
        const plain =
          settlement.metadata && typeof settlement.metadata === 'object' && !(settlement.metadata instanceof Map)
            ? { ...settlement.metadata }
            : {};
        settlement.metadata = new Map(Object.entries(plain));
      }

      // Check if already marked for restaurant payout
      const isAlreadyMarked = settlement.metadata.get('restaurantFinanceReportMarked') === true;
      if (!isAlreadyMarked && settlement.restaurantEarning?.netEarning > 0) {
        const rId = settlement.restaurantId.toString();
        restaurantPayouts.set(rId, (restaurantPayouts.get(rId) || 0) + settlement.restaurantEarning.netEarning);
      }

      // Mark for both reports to be safe if applicable
      settlement.metadata.set('restaurantFinanceReportMarked', true);
      settlement.metadata.set('deliveryFinanceReportMarked', true);
      settlement.metadata.set('restaurantFinanceReportMarkedAt', new Date().toISOString());
      settlement.metadata.set('restaurantFinanceReportMarkedByType', actorType || 'admin');
      settlement.metadata.set('restaurantFinanceReportMarkedById', actorId ? String(actorId) : null);
      settlement.metadata.set('deliveryFinanceReportMarkedAt', new Date().toISOString());
      settlement.metadata.set('deliveryFinanceReportMarkedByType', actorType || 'admin');
      settlement.metadata.set('deliveryFinanceReportMarkedById', actorId ? String(actorId) : null);

      if (settlement.restaurantEarning.status !== 'cancelled' && !settlement.restaurantSettled) {
        settlement.restaurantSettled = true;
      }
      if (settlement.deliveryPartnerEarning.status !== 'cancelled' && !settlement.deliveryPartnerSettled) {
        settlement.deliveryPartnerSettled = true;
      }
      await settlement.save();
    }

    // Update restaurant wallets for the payout
    for (const [restaurantId, totalAmount] of restaurantPayouts.entries()) {
      try {
        const wallet = await RestaurantWallet.findOrCreateByRestaurantId(restaurantId);
        wallet.addTransaction({
          amount: totalAmount,
          type: 'withdrawal',
          status: 'Completed',
          description: `Payout for ${settlementIds.length} settlements processed by admin`
        });
        await wallet.save();
        console.log(`[FINANCE] Updated restaurant wallet ${restaurantId} with payout of ₹${totalAmount}`);
        
        // Notify restaurant about the payout
        try {
          await notifyRestaurantPayoutProcessing(restaurantId, totalAmount, settlementIds.length);
        } catch (notifErr) {
          console.error(`[FINANCE] Failed to notify restaurant ${restaurantId} about payout:`, notifErr.message);
        }
      } catch (walletErr) {
        console.error(`[FINANCE] Failed to update wallet for restaurant ${restaurantId}:`, walletErr.message);
      }
    }

    return settlements;
  } catch (error) {
    console.error('Error marking settlements as processed:', error);
    throw error;
  }
};
