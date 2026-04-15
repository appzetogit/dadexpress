import { asyncHandler } from '../../../shared/middleware/asyncHandler.js';
import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import Delivery from '../../delivery/models/Delivery.js';
import DeliveryWallet from '../../delivery/models/DeliveryWallet.js';
import Order from '../../order/models/Order.js';
import mongoose from 'mongoose';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Get All Delivery Partners Earnings
 * GET /api/admin/delivery-partners/earnings
 * Query params: deliveryPartnerId, period (today, week, month, all), page, limit, search, fromDate, toDate
 */
export const getDeliveryEarnings = asyncHandler(async (req, res) => {
  try {
    const { 
      deliveryPartnerId,
      period = 'all',
      page = 1,
      limit = 50,
      search,
      fromDate,
      toDate
    } = req.query;

    console.log('📊 Admin fetching delivery earnings with params:', {
      deliveryPartnerId,
      period,
      page,
      limit,
      search,
      fromDate,
      toDate
    });

    // Build query for delivery partners
    // Note: We intentionally do NOT apply the text search here so that searching
    // can also match orderId, restaurantName, etc. across all earnings.
    // Search is applied later on the flattened earnings list.
    const deliveryQuery = {};
    if (deliveryPartnerId) {
      deliveryQuery._id = deliveryPartnerId;
    }

    // Get delivery partners
    const deliveries = await Delivery.find(deliveryQuery)
      .select('_id name phone email deliveryId status')
      .lean();

    console.log(`👥 Found ${deliveries.length} delivery partners`);

    const deliveryIds = deliveries.map(d => d._id);
    
    if (deliveryIds.length === 0) {
      console.warn('⚠️ No delivery partners found matching query');
    }

    if (deliveryIds.length === 0) {
      return successResponse(res, 200, 'No delivery partners found', {
        earnings: [],
        summary: {
          totalDeliveryPartners: 0,
          totalEarnings: 0,
          totalOrders: 0
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    // Calculate date range
    let startDate = null;
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (fromDate || toDate) {
      if (fromDate) {
        startDate = new Date(fromDate);
        startDate.setHours(0, 0, 0, 0);
      }
      if (toDate) {
        endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      const now = new Date();
      switch (period) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'week':
          startDate = new Date(now);
          const day = startDate.getDay();
          const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
          startDate.setDate(diff);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = null;
      }
    }

    // Get all wallets for delivery partners
    // Note: DeliveryWallet uses 'deliveryId' field, not 'deliveryPartnerId'
    const wallets = await DeliveryWallet.find({
      deliveryId: { $in: deliveryIds }
    }).lean();

    console.log(`📊 Found ${wallets.length} wallets for ${deliveryIds.length} delivery partners`);

    // Get all earnings transactions
    let allEarnings = [];
    
    for (const wallet of wallets) {
      // Match wallet.deliveryId with delivery._id
      const delivery = deliveries.find(d => {
        const deliveryId = d._id.toString();
        const walletDeliveryId = wallet.deliveryId?.toString();
        return deliveryId === walletDeliveryId;
      });
      
      if (!delivery) {
        console.warn(`⚠️ No delivery found for wallet with deliveryId: ${wallet.deliveryId}`);
        continue;
      }

      let transactions = wallet.transactions || [];
      
      // Filter by payment type and completed status
      transactions = transactions.filter(t => 
        t.type === 'payment' && 
        t.status === 'Completed'
      );

      console.log(`💰 Found ${transactions.length} completed payment transactions for ${delivery.name}`);

      // Filter by date range
      if (startDate) {
        const beforeFilter = transactions.length;
        transactions = transactions.filter(t => {
          const transactionDate = t.createdAt || t.processedAt || new Date();
          return transactionDate >= startDate && transactionDate <= endDate;
        });
        console.log(`📅 After date filter: ${transactions.length} transactions (was ${beforeFilter})`);
      }

      if (transactions.length === 0) {
        console.log(`⚠️ No transactions after filtering for ${delivery.name}`);
        continue;
      }

      // Get order details for each transaction
      const orderIds = transactions
        .filter(t => t.orderId)
        .map(t => {
          // Handle both ObjectId and string formats
          if (mongoose.Types.ObjectId.isValid(t.orderId)) {
            return typeof t.orderId === 'string' ? new mongoose.Types.ObjectId(t.orderId) : t.orderId;
          }
          console.warn(`⚠️ Invalid orderId in transaction: ${t.orderId}`);
          return null;
        })
        .filter(Boolean);

      let orders = [];
      if (orderIds.length > 0) {
        try {
          orders = await Order.find({
            _id: { $in: orderIds }
          })
            .select('orderId status createdAt deliveredAt pricing.total pricing.deliveryFee restaurantName address')
            .lean();
          
          console.log(`📦 Found ${orders.length} orders for ${orderIds.length} order IDs`);
        } catch (orderError) {
          console.error(`❌ Error fetching orders:`, orderError);
        }
      }

      // Create earnings entries
      for (const transaction of transactions) {
        // Find order by matching _id with transaction.orderId
        const order = orders.find(o => {
          const orderMongoId = o._id.toString();
          const transactionOrderId = transaction.orderId?.toString();
          return orderMongoId === transactionOrderId;
        });

        // Get transaction date
        const transactionDate = transaction.createdAt || transaction.processedAt || new Date();

        allEarnings.push({
          deliveryPartnerId: delivery._id.toString(),
          deliveryPartnerName: delivery.name || 'Unknown',
          deliveryPartnerPhone: delivery.phone || 'N/A',
          deliveryPartnerEmail: delivery.email || 'N/A',
          deliveryId: delivery.deliveryId || 'N/A',
          transactionId: transaction._id?.toString() || transaction.id || 'N/A',
          orderId: order?.orderId || 'N/A',
          orderMongoId: transaction.orderId?.toString() || null,
          amount: transaction.amount || 0,
          status: transaction.status || 'Completed',
          createdAt: transactionDate,
          deliveredAt: order?.deliveredAt || null,
          orderStatus: order?.status || 'unknown',
          restaurantName: order?.restaurantName || 'N/A',
          orderTotal: order?.pricing?.total || 0,
          deliveryFee: order?.pricing?.deliveryFee || 0,
          customerAddress: order?.address?.formattedAddress || 'N/A'
        });
      }

      console.log(`✅ Added ${transactions.length} earnings entries for ${delivery.name}`);
    }

    // Apply search across earnings if provided (name, phone, deliveryId, orderId, restaurant, email)
    if (search && typeof search === 'string' && search.trim()) {
      const query = search.trim().toLowerCase();
      allEarnings = allEarnings.filter((e) => {
        const fields = [
          e.deliveryPartnerName,
          e.deliveryPartnerPhone,
          e.deliveryPartnerEmail,
          e.deliveryId,
          e.orderId,
          e.restaurantName,
        ];
        return fields.some((field) =>
          field?.toString().toLowerCase().includes(query)
        );
      });
    }

    // Sort by date (newest first)
    allEarnings.sort((a, b) => {
      const dateA = a.createdAt || new Date(0);
      const dateB = b.createdAt || new Date(0);
      return dateB - dateA;
    });

    // Calculate summary
    const totalEarnings = allEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalOrders = allEarnings.length;
    const uniqueDeliveryPartners = new Set(allEarnings.map(e => e.deliveryPartnerId?.toString()).filter(Boolean)).size;

    console.log(`✅ Summary: Total earnings: ₹${totalEarnings}, Total orders: ${totalOrders}, Unique delivery partners: ${uniqueDeliveryPartners}`);

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedEarnings = allEarnings.slice(skip, skip + parseInt(limit));

    console.log(`📄 Returning page ${page} with ${paginatedEarnings.length} earnings (total: ${allEarnings.length})`);

    return successResponse(res, 200, 'Delivery earnings retrieved successfully', {
      earnings: paginatedEarnings,
      summary: {
        period,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        totalDeliveryPartners: uniqueDeliveryPartners,
        totalEarnings,
        totalOrders
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allEarnings.length,
        pages: Math.ceil(allEarnings.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching delivery earnings: ${error.message}`, { stack: error.stack });
    return errorResponse(res, 500, 'Failed to fetch delivery earnings');
  }
});

/**
 * Delete a delivery earning transaction from wallet
 * DELETE /api/admin/delivery-partners/earnings/:transactionId
 */
export const deleteDeliveryEarning = asyncHandler(async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId || !mongoose.Types.ObjectId.isValid(transactionId)) {
      return errorResponse(res, 400, 'Invalid transaction ID');
    }

    const wallet = await DeliveryWallet.findOne({
      'transactions._id': new mongoose.Types.ObjectId(transactionId),
    });

    if (!wallet) {
      return errorResponse(res, 404, 'Earning transaction not found');
    }

    const transaction = wallet.transactions.id(transactionId);
    if (!transaction) {
      return errorResponse(res, 404, 'Earning transaction not found');
    }

    const deletedTransaction = {
      transactionId: transaction._id?.toString(),
      type: transaction.type,
      amount: Number(transaction.amount) || 0,
      orderId: transaction.orderId?.toString() || null,
      status: transaction.status,
    };

    transaction.deleteOne();

    const completedTransactions = wallet.transactions.filter(
      (t) => t.status === 'Completed'
    );

    let totalBalance = 0;
    let totalEarned = 0;
    let totalWithdrawn = 0;
    let cashInHand = 0;

    completedTransactions.forEach((t) => {
      const amount = Number(t.amount) || 0;

      if (
        t.type === 'payment' ||
        t.type === 'bonus' ||
        t.type === 'refund' ||
        t.type === 'earning_addon'
      ) {
        totalBalance += amount;
        totalEarned += amount;
        if (t.paymentCollected) {
          cashInHand += amount;
        }
      } else if (t.type === 'withdrawal') {
        totalBalance -= amount;
        totalWithdrawn += amount;
        if (t.paymentCollected) {
          cashInHand = Math.max(0, cashInHand - amount);
        }
      } else if (t.type === 'deduction') {
        totalBalance -= amount;
        cashInHand = Math.max(0, cashInHand - amount);
      } else if (t.type === 'deposit') {
        cashInHand = Math.max(0, cashInHand - amount);
      }
    });

    wallet.totalBalance = Math.max(0, totalBalance);
    wallet.totalEarned = Math.max(0, totalEarned);
    wallet.totalWithdrawn = Math.max(0, totalWithdrawn);
    wallet.cashInHand = Math.max(0, cashInHand);
    wallet.lastTransactionAt =
      wallet.transactions.length > 0
        ? new Date(
            Math.max(
              ...wallet.transactions.map((t) =>
                new Date(t.createdAt || t.processedAt || Date.now()).getTime()
              )
            )
          )
        : null;

    await wallet.save();

    return successResponse(res, 200, 'Delivery earning deleted successfully', {
      deletedTransaction,
      wallet: {
        id: wallet._id,
        totalBalance: wallet.totalBalance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
        cashInHand: wallet.cashInHand,
      },
    });
  } catch (error) {
    logger.error(`Error deleting delivery earning: ${error.message}`, { stack: error.stack });
    return errorResponse(res, 500, 'Failed to delete delivery earning');
  }
});

