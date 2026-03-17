import Order from '../models/Order.js';
import { generateOrderId, normalizeOrderId } from '../../../shared/utils/idUtils.js';
import Payment from '../../payment/models/Payment.js';
import { createOrder as createRazorpayOrder, verifyPayment } from '../../payment/services/razorpayService.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import User from '../../auth/models/User.js';
import Zone from '../../admin/models/Zone.js';
import mongoose from 'mongoose';
import winston from 'winston';
import { calculateOrderPricing } from '../services/orderCalculationService.js';
import { getRazorpayCredentials } from '../../../shared/utils/envService.js';
import { notifyRestaurantNewOrder, notifyRestaurantOrderUpdate } from '../services/restaurantNotificationService.js';
import { calculateOrderSettlement } from '../services/orderSettlementService.js';
import { holdEscrow } from '../services/escrowWalletService.js';
import { processCancellationRefund } from '../services/cancellationRefundService.js';
import etaCalculationService from '../services/etaCalculationService.js';
import etaWebSocketService from '../services/etaWebSocketService.js';
import OrderEvent from '../models/OrderEvent.js';
import UserWallet from '../../user/models/UserWallet.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

let cachedActiveZones = null;
let cachedActiveZonesAt = 0;
const ACTIVE_ZONES_TTL_MS = 30000;

const getActiveZonesCached = async () => {
  const now = Date.now();
  if (cachedActiveZones && (now - cachedActiveZonesAt) < ACTIVE_ZONES_TTL_MS) {
    return cachedActiveZones;
  }
  try {
    const zones = await Zone.find({ isActive: true }).lean();
    cachedActiveZones = zones;
    cachedActiveZonesAt = now;
    return zones;
  } catch (err) {
    if (cachedActiveZones) {
      return cachedActiveZones;
    }
    throw err;
  }
};

/**
 * Create a new order and initiate Razorpay payment
 */
export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      items,
      address,
      restaurantId,
      restaurantName,
      pricing,
      deliveryFleet,
      note,
      deliveryInstruction,
      sendCutlery,
      paymentMethod: bodyPaymentMethod
    } = req.body;
    const normalizedRestaurantInstruction = (() => {
      const restaurantInstructionRaw =
        note ??
        req.body?.restaurantInstruction ??
        req.body?.restaurantInstructions ??
        req.body?.specialInstruction ??
        req.body?.specialInstructions ??
        req.body?.instructions ??
        '';
      return typeof restaurantInstructionRaw === 'string' ? restaurantInstructionRaw.trim() : '';
    })();
    const normalizedDeliveryInstruction = (() => {
      const deliveryInstructionRaw =
        deliveryInstruction ??
        req.body?.deliveryInstructions ??
        req.body?.delivery_instruction ??
        '';
      return typeof deliveryInstructionRaw === 'string' ? deliveryInstructionRaw.trim() : '';
    })();
    const normalizedSendCutlery = (() => {
      const cutleryRaw =
        sendCutlery ??
        req.body?.cutlery ??
        req.body?.send_cutlery;
      if (typeof cutleryRaw === 'boolean') return cutleryRaw;
      if (typeof cutleryRaw === 'number') return cutleryRaw !== 0;
      if (typeof cutleryRaw === 'string') {
        const value = cutleryRaw.trim().toLowerCase();
        if (['false', '0', 'no', 'none'].includes(value)) return false;
        if (['true', '1', 'yes'].includes(value)) return true;
      }
      return true;
    })();
    // Support both camelCase and snake_case from client
    const paymentMethod = bodyPaymentMethod ?? req.body.payment_method;

    // Normalize payment method: 'cod' / 'COD' / 'Cash on Delivery' → 'cash', 'wallet' → 'wallet'
    const normalizedPaymentMethod = (() => {
      const m = (paymentMethod && String(paymentMethod).toLowerCase().trim()) || '';
      if (m === 'cash' || m === 'cod' || m === 'cash on delivery' || m === 'cash_on_delivery') return 'cash';
      if (m === 'wallet') return 'wallet';
      if (m === 'razorpay' || m === 'online') return 'razorpay';
      if (m === 'upi') return 'upi';
      if (m === 'card') return 'card';
      return 'razorpay';
    })();
    logger.info('Order create paymentMethod:', { raw: paymentMethod, normalized: normalizedPaymentMethod, bodyKeys: Object.keys(req.body || {}).filter(k => k.toLowerCase().includes('payment')) });

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Delivery address is required'
      });
    }

    if (!pricing || !pricing.total) {
      return res.status(400).json({
        success: false,
        message: 'Order total is required'
      });
    }

    if (normalizedDeliveryInstruction && String(normalizedDeliveryInstruction).length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Delivery instruction is too long (max 200 characters)'
      });
    }

    // Validate and assign restaurant - order goes to the restaurant whose food was ordered
    if (!restaurantId || restaurantId === 'unknown') {
      return res.status(400).json({
        success: false,
        message: 'Restaurant ID is required. Please select a restaurant.'
      });
    }

    let assignedRestaurantId = restaurantId;
    let assignedRestaurantName = restaurantName;

    // Log incoming restaurant data for debugging
    logger.info('🔍 Order creation - Restaurant lookup:', {
      incomingRestaurantId: restaurantId,
      incomingRestaurantName: restaurantName,
      restaurantIdType: typeof restaurantId,
      restaurantIdLength: restaurantId?.length
    });

    // Find and validate the restaurant
    let restaurant = null;
    // Try to find restaurant by restaurantId, _id, or slug
    if (mongoose.Types.ObjectId.isValid(restaurantId) && restaurantId.length === 24) {
      restaurant = await Restaurant.findById(restaurantId);
      logger.info('🔍 Restaurant lookup by _id:', {
        restaurantId: restaurantId,
        found: !!restaurant,
        restaurantName: restaurant?.name
      });
    }
    if (!restaurant) {
      restaurant = await Restaurant.findOne({
        $or: [
          { restaurantId: restaurantId },
          { slug: restaurantId }
        ]
      });
      logger.info('🔍 Restaurant lookup by restaurantId/slug:', {
        restaurantId: restaurantId,
        found: !!restaurant,
        restaurantName: restaurant?.name,
        restaurant_restaurantId: restaurant?.restaurantId,
        restaurant__id: restaurant?._id?.toString()
      });
    }

    if (!restaurant) {
      logger.error('❌ Restaurant not found:', {
        searchedRestaurantId: restaurantId,
        searchedRestaurantName: restaurantName
      });
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    // CRITICAL: Validate restaurant name matches
    if (restaurantName && restaurant.name !== restaurantName) {
      logger.warn('⚠️ Restaurant name mismatch:', {
        incomingName: restaurantName,
        foundRestaurantName: restaurant.name,
        incomingRestaurantId: restaurantId,
        foundRestaurantId: restaurant._id?.toString() || restaurant.restaurantId
      });
      // Still proceed but log the mismatch
    }

    // Note: Removed isAcceptingOrders check - orders can come even when restaurant is offline
    // Restaurant can accept/reject orders manually, or orders will auto-reject after accept time expires
    // if (!restaurant.isAcceptingOrders) {
    //   logger.warn('⚠️ Restaurant not accepting orders:', {
    //     restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
    //     restaurantName: restaurant.name
    //   });
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Restaurant is currently not accepting orders'
    //   });
    // }

    if (!restaurant.isActive) {
      logger.warn('⚠️ Restaurant is inactive:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(403).json({
        success: false,
        message: 'Restaurant is currently inactive'
      });
    }

    // CRITICAL: Validate that restaurant's location (pin) is within an active zone
    const restaurantLat = restaurant.location?.latitude || restaurant.location?.coordinates?.[1];
    const restaurantLng = restaurant.location?.longitude || restaurant.location?.coordinates?.[0];

    if (!restaurantLat || !restaurantLng) {
      logger.error('❌ Restaurant location not found:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name
      });
      return res.status(400).json({
        success: false,
        message: 'Restaurant location is not set. Please contact support.'
      });
    }

    // Check if restaurant is within active zones
    const activeZones = await getActiveZonesCached();
    const matchedRestaurantZones = [];

    for (const zone of activeZones) {
      if (!zone.coordinates || zone.coordinates.length < 3) continue;

      let isInZone = false;
      if (typeof zone.containsPoint === 'function') {
        isInZone = zone.containsPoint(restaurantLat, restaurantLng);
      } else {
        // Ray casting algorithm
        let inside = false;
        for (let i = 0, j = zone.coordinates.length - 1; i < zone.coordinates.length; j = i++) {
          const coordI = zone.coordinates[i];
          const coordJ = zone.coordinates[j];
          const xi = typeof coordI === 'object' ? (coordI.latitude || coordI.lat) : null;
          const yi = typeof coordI === 'object' ? (coordI.longitude || coordI.lng) : null;
          const xj = typeof coordJ === 'object' ? (coordJ.latitude || coordJ.lat) : null;
          const yj = typeof coordJ === 'object' ? (coordJ.longitude || coordJ.lng) : null;

          if (xi === null || yi === null || xj === null || yj === null) continue;

          const intersect = ((yi > restaurantLng) !== (yj > restaurantLng)) &&
            (restaurantLat < (xj - xi) * (restaurantLng - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        isInZone = inside;
      }

      if (isInZone) {
        matchedRestaurantZones.push(zone);
      }
    }

    if (matchedRestaurantZones.length === 0) {
      logger.warn('⚠️ Restaurant location is not within any active zone:', {
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
        restaurantName: restaurant.name,
        restaurantLat,
        restaurantLng
      });
      return res.status(403).json({
        success: false,
        message: 'This restaurant is not available in your area. Only restaurants within active delivery zones can receive orders.'
      });
    }

    // If restaurant overlaps multiple zones, prefer the user's zone (when provided)
    // to avoid false mismatch due to different zone-selection strategies.
    const { zoneId: userZoneId } = req.body; // User's zone ID from frontend
    const normalizedUserZoneId = userZoneId ? String(userZoneId).trim() : null;
    const restaurantZone =
      normalizedUserZoneId
        ? matchedRestaurantZones.find((zone) => zone?._id?.toString() === normalizedUserZoneId) || matchedRestaurantZones[0]
        : matchedRestaurantZones[0];

    logger.info('✅ Restaurant validated - location is within active zone:', {
      restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
      restaurantName: restaurant.name,
      zoneId: restaurantZone?._id?.toString(),
      zoneName: restaurantZone?.name || restaurantZone?.zoneName
    });

    // CRITICAL: Validate user's zone matches restaurant's zone (strict zone matching)
    if (normalizedUserZoneId) {
      const restaurantZoneId = restaurantZone._id.toString();

      if (restaurantZoneId !== normalizedUserZoneId) {
        logger.warn('⚠️ Zone mismatch - user and restaurant are in different zones:', {
          userZoneId: normalizedUserZoneId,
          restaurantZoneId,
          restaurantId: restaurant._id?.toString() || restaurant.restaurantId,
          restaurantName: restaurant.name
        });
        return res.status(403).json({
          success: false,
          message: 'This restaurant is not available in your zone. Please select a restaurant from your current delivery zone.'
        });
      }

      logger.info('✅ Zone match validated - user and restaurant are in the same zone:', {
        zoneId: normalizedUserZoneId,
        restaurantId: restaurant._id?.toString() || restaurant.restaurantId
      });
    } else {
      logger.warn('⚠️ User zoneId not provided in order request - zone validation skipped');
    }

    assignedRestaurantId = restaurant._id?.toString() || restaurant.restaurantId;
    assignedRestaurantName = restaurant.name;

    // Log restaurant assignment for debugging
    logger.info('✅ Restaurant assigned to order:', {
      assignedRestaurantId: assignedRestaurantId,
      assignedRestaurantName: assignedRestaurantName,
      restaurant_id: restaurant._id?.toString(),
      restaurant_restaurantId: restaurant.restaurantId,
      incomingRestaurantId: restaurantId,
      incomingRestaurantName: restaurantName
    });

    // Generate strict URL-safe order ID
    const generatedOrderId = generateOrderId();

    // Ensure couponCode is included in pricing
    if (!pricing.couponCode && pricing.appliedCoupon?.code) {
      pricing.couponCode = pricing.appliedCoupon.code;
    }

    // Re-calculate pricing on backend to handle referral coins and ensure correctness
    const { useReferralCoins, coinsToUse } = req.body;
    const finalPricing = await calculateOrderPricing({
      items,
      restaurantId,
      deliveryAddress: address,
      couponCode: pricing.couponCode || pricing.appliedCoupon?.code || null,
      deliveryFleet: deliveryFleet || 'standard',
      userId,
      useReferralCoins,
      coinsToUse
    });

    // Deduct referral coins if used
    if (finalPricing.referralDiscount > 0) {
      const User = (await import('../../auth/models/User.js')).default;
      await User.findByIdAndUpdate(userId, {
        $inc: { 'wallet.balance': -finalPricing.referralDiscount }
      });
      logger.info(`Deducted ${finalPricing.referralDiscount} referral coins from user ${userId} for order ${generatedOrderId}`);
    }

    // Create order in database with pending status
    const order = new Order({
      orderId: generatedOrderId,
      userId,
      restaurantId: assignedRestaurantId,
      restaurantName: assignedRestaurantName,
      items,
      address,
      pricing: finalPricing,
      deliveryFleet: deliveryFleet || 'standard',
      note: normalizedRestaurantInstruction,
      deliveryInstruction: normalizedDeliveryInstruction,
      sendCutlery: normalizedSendCutlery,
      status: 'pending',
      payment: {
        method: normalizedPaymentMethod,
        status: 'pending'
      }
    });

    // Parse preparation time from order items
    // Extract maximum preparation time from items (e.g., "20-25 mins" -> 25)
    let maxPreparationTime = 0;
    if (items && Array.isArray(items)) {
      items.forEach(item => {
        if (item.preparationTime) {
          const prepTimeStr = String(item.preparationTime).trim();
          // Parse formats like "20-25 mins", "20-25", "25 mins", "25"
          const match = prepTimeStr.match(/(\d+)(?:\s*-\s*(\d+))?/);
          if (match) {
            const minTime = parseInt(match[1], 10);
            const maxTime = match[2] ? parseInt(match[2], 10) : minTime;
            maxPreparationTime = Math.max(maxPreparationTime, maxTime);
          }
        }
      });
    }
    order.preparationTime = maxPreparationTime;
    logger.info('📋 Preparation time extracted from items:', {
      maxPreparationTime,
      itemsCount: items?.length || 0
    });

    // Calculate initial ETA
    try {
      const restaurantLocation = restaurant.location
        ? {
          latitude: restaurant.location.latitude,
          longitude: restaurant.location.longitude
        }
        : null;

      const userLocation = address.location?.coordinates
        ? {
          latitude: address.location.coordinates[1],
          longitude: address.location.coordinates[0]
        }
        : null;

      if (restaurantLocation && userLocation) {
        const etaResult = await etaCalculationService.calculateInitialETA({
          restaurantId: assignedRestaurantId,
          restaurantLocation,
          userLocation
        });

        // Add preparation time to ETA (use max preparation time)
        const finalMinETA = etaResult.minETA + maxPreparationTime;
        const finalMaxETA = etaResult.maxETA + maxPreparationTime;

        // Update order with ETA (including preparation time)
        order.eta = {
          min: finalMinETA,
          max: finalMaxETA,
          lastUpdated: new Date(),
          additionalTime: 0 // Will be updated when restaurant adds time
        };
        order.estimatedDeliveryTime = Math.ceil((finalMinETA + finalMaxETA) / 2);

        // Create order created event
        await OrderEvent.create({
          orderId: order._id,
          eventType: 'ORDER_CREATED',
          data: {
            initialETA: {
              min: finalMinETA,
              max: finalMaxETA
            },
            preparationTime: maxPreparationTime
          },
          timestamp: new Date()
        });

        logger.info('✅ ETA calculated for order:', {
          orderId: order.orderId,
          eta: `${finalMinETA} -${finalMaxETA} mins`,
          preparationTime: maxPreparationTime,
          baseETA: `${etaResult.minETA} -${etaResult.maxETA} mins`
        });
      } else {
        logger.warn('⚠️ Could not calculate ETA - missing location data');
      }
    } catch (etaError) {
      logger.error('❌ Error calculating ETA:', etaError);
      // Continue with order creation even if ETA calculation fails
    }

    await order.save();

    // Log order creation for debugging
    logger.info('Order created successfully:', {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
      restaurantId: order.restaurantId,
      userId: order.userId,
      status: order.status,
      total: order.pricing.total,
      eta: order.eta ? `${order.eta.min} -${order.eta.max} mins` : 'N/A',
      paymentMethod: normalizedPaymentMethod
    });

    // For wallet payments, check balance and deduct before creating order
    if (normalizedPaymentMethod === 'wallet') {
      try {
        // Find or create wallet
        const wallet = await UserWallet.findOrCreateByUserId(userId);

        // Check if sufficient balance
        if (pricing.total > wallet.balance) {
          return res.status(400).json({
            success: false,
            message: 'Insufficient wallet balance',
            data: {
              required: pricing.total,
              available: wallet.balance,
              shortfall: pricing.total - wallet.balance
            }
          });
        }

        // Check if transaction already exists for this order (prevent duplicate)
        const existingTransaction = wallet.transactions.find(
          t => t.orderId && t.orderId.toString() === order._id.toString() && t.type === 'deduction'
        );

        if (existingTransaction) {
          logger.warn('⚠️ Wallet payment already processed for this order', {
            orderId: order.orderId,
            transactionId: existingTransaction._id
          });
        } else {
          // Deduct money from wallet
          const transaction = wallet.addTransaction({
            amount: pricing.total,
            type: 'deduction',
            status: 'Completed',
            description: `Order payment - Order #${order.orderId} `,
            orderId: order._id
          });

          await wallet.save();

          // Update user's wallet balance in User model (for backward compatibility)
          const User = (await import('../../auth/models/User.js')).default;
          await User.findByIdAndUpdate(userId, {
            'wallet.balance': wallet.balance,
            'wallet.currency': wallet.currency
          });

          logger.info('✅ Wallet payment deducted for order:', {
            orderId: order.orderId,
            userId: userId,
            amount: pricing.total,
            transactionId: transaction._id,
            newBalance: wallet.balance
          });
        }

        // Create payment record
        try {
          const payment = new Payment({
            paymentId: `PAY - ${Date.now()} -${Math.floor(Math.random() * 1000)} `,
            orderId: order._id,
            userId,
            amount: pricing.total,
            currency: 'INR',
            method: 'wallet',
            status: 'completed',
            logs: [{
              action: 'completed',
              timestamp: new Date(),
              details: {
                previousStatus: 'new',
                newStatus: 'completed',
                note: 'Wallet payment completed'
              }
            }]
          });
          await payment.save();
        } catch (paymentError) {
          logger.error('❌ Error creating wallet payment record:', paymentError);
        }

        // Mark order as confirmed and payment as completed
        order.payment.method = 'wallet';
        order.payment.status = 'completed';
        order.status = 'confirmed';
        order.tracking.confirmed = {
          status: true,
          timestamp: new Date()
        };
        await order.save();

        // Notify restaurant about new wallet payment order
        try {
          const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'wallet');
          logger.info('✅ Wallet payment order notification sent to restaurant', {
            orderId: order.orderId,
            restaurantId: assignedRestaurantId,
            notifyRestaurantResult
          });
        } catch (notifyError) {
          logger.error('❌ Error notifying restaurant about wallet payment order:', notifyError);
        }

        // Respond to client
        return res.status(201).json({
          success: true,
          data: {
            order: {
              id: order._id.toString(),
              orderId: order.orderId,
              status: order.status,
              total: pricing.total
            },
            razorpay: null,
            wallet: {
              balance: wallet.balance,
              deducted: pricing.total
            }
          }
        });
      } catch (walletError) {
        logger.error('❌ Error processing wallet payment:', walletError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process wallet payment',
          error: walletError.message
        });
      }
    }

    // For cash-on-delivery orders, confirm immediately and notify restaurant.
    // Online (Razorpay) orders follow the existing verifyOrderPayment flow.
    if (normalizedPaymentMethod === 'cash') {
      // Best-effort payment record; even if it fails we still proceed with order.
      try {
        const payment = new Payment({
          paymentId: `PAY - ${Date.now()} -${Math.floor(Math.random() * 1000)} `,
          orderId: order._id,
          userId,
          amount: order.pricing.total,
          currency: 'INR',
          method: 'cash',
          status: 'pending',
          logs: [{
            action: 'pending',
            timestamp: new Date(),
            details: {
              previousStatus: 'new',
              newStatus: 'pending',
              note: 'Cash on delivery order created'
            }
          }]
        });
        await payment.save();
      } catch (paymentError) {
        logger.error('❌ Error creating COD payment record (continuing without blocking order):', {
          error: paymentError.message,
          stack: paymentError.stack
        });
      }

      // Mark order as confirmed so restaurant can prepare it (ensure payment.method is cash for notification)
      order.payment.method = 'cash';
      order.payment.status = 'pending';
      order.status = 'confirmed';
      order.tracking.confirmed = {
        status: true,
        timestamp: new Date()
      };
      await order.save();

      // Calculate order settlement and hold escrow for COD orders too
      try {
        await calculateOrderSettlement(order._id);
        await holdEscrow(order._id, userId, order.pricing.total);
        logger.info(`✅ Order settlement calculated and escrow held for COD order ${order.orderId}`);
      } catch (settlementError) {
        logger.error(`❌ Error calculating settlement for COD order ${order.orderId}: `, settlementError);
      }

      // Notify restaurant about new COD order via Socket.IO (non-blocking)
      try {
        const notifyRestaurantResult = await notifyRestaurantNewOrder(order, assignedRestaurantId, 'cash');
        logger.info('✅ COD order notification sent to restaurant', {
          orderId: order.orderId,
          restaurantId: assignedRestaurantId,
          notifyRestaurantResult
        });
      } catch (notifyError) {
        logger.error('❌ Error notifying restaurant about COD order (order still created):', {
          error: notifyError.message,
          stack: notifyError.stack
        });
      }

      // Respond to client (no Razorpay details for COD)
      return res.status(201).json({
        success: true,
        data: {
          order: {
            id: order._id.toString(),
            orderId: order.orderId,
            status: order.status,
            total: pricing.total
          },
          razorpay: null
        }
      });
    }

    // Note: For Razorpay / online payments, restaurant notification will be sent
    // after payment verification in verifyOrderPayment. This ensures restaurant
    // only receives prepaid orders after successful payment.

    // Create Razorpay order for online payments
    let razorpayOrder = null;
    if (normalizedPaymentMethod === 'razorpay' || !normalizedPaymentMethod) {
      try {
        razorpayOrder = await createRazorpayOrder({
          amount: Math.round(pricing.total * 100), // Convert to paise
          currency: 'INR',
          receipt: order.orderId,
          notes: {
            orderId: order.orderId,
            userId: userId.toString(),
            restaurantId: restaurantId || 'unknown'
          }
        });

        // Update order with Razorpay order ID
        order.payment.razorpayOrderId = razorpayOrder.id;
        await order.save();
      } catch (razorpayError) {
        logger.error(`Error creating Razorpay order: ${razorpayError.message} `);
        // Continue with order creation even if Razorpay fails
        // Payment can be handled later
      }
    }

    logger.info(`Order created: ${order.orderId} `, {
      orderId: order.orderId,
      userId,
      amount: pricing.total,
      razorpayOrderId: razorpayOrder?.id
    });

    // Get Razorpay key ID from env service
    let razorpayKeyId = null;
    if (razorpayOrder) {
      try {
        const credentials = await getRazorpayCredentials();
        razorpayKeyId = credentials.keyId || process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;
      } catch (error) {
        logger.warn(`Failed to get Razorpay key ID from env service: ${error.message} `);
        razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_API_KEY;
      }
    }

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status,
          total: pricing.total
        },
        razorpay: razorpayOrder ? {
          orderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: razorpayKeyId
        } : null
      }
    });
  } catch (error) {
    logger.error(`Error creating order: ${error.message} `, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify payment and confirm order
 */
export const verifyOrderPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment verification fields'
      });
    }

    // Find order (support both MongoDB ObjectId and orderId string)
    let order;
    try {
      // Try to find by MongoDB ObjectId first
      const mongoose = (await import('mongoose')).default;
      if (mongoose.Types.ObjectId.isValid(orderId)) {
        order = await Order.findOne({
          _id: orderId,
          userId
        });
      }

      // If not found, try by orderId string
      if (!order) {
        order = await Order.findOne({
          orderId: orderId,
          userId
        });
      }
    } catch (error) {
      // Fallback: try both
      order = await Order.findOne({
        $or: [
          { _id: orderId },
          { orderId: orderId }
        ],
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify payment signature
    const isValid = await verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      // Update order payment status to failed
      order.payment.status = 'failed';
      await order.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Create payment record
    const payment = new Payment({
      paymentId: `PAY - ${Date.now()} -${Math.floor(Math.random() * 1000)} `,
      orderId: order._id,
      userId,
      amount: order.pricing.total,
      currency: 'INR',
      method: 'razorpay',
      status: 'completed',
      razorpay: {
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature
      },
      transactionId: razorpayPaymentId,
      completedAt: new Date(),
      logs: [{
        action: 'completed',
        timestamp: new Date(),
        details: {
          razorpayOrderId,
          razorpayPaymentId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }]
    });

    await payment.save();

    // Update order status
    order.payment.status = 'completed';
    order.payment.razorpayPaymentId = razorpayPaymentId;
    order.payment.razorpaySignature = razorpaySignature;
    order.payment.transactionId = razorpayPaymentId;
    order.status = 'confirmed';
    order.tracking.confirmed = { status: true, timestamp: new Date() };
    await order.save();

    // Calculate order settlement and hold escrow
    try {
      // Calculate settlement breakdown
      await calculateOrderSettlement(order._id);

      // Hold funds in escrow
      await holdEscrow(order._id, userId, order.pricing.total);

      logger.info(`✅ Order settlement calculated and escrow held for order ${order.orderId}`);
    } catch (settlementError) {
      logger.error(`❌ Error calculating settlement for order ${order.orderId}: `, settlementError);
      // Don't fail payment verification if settlement calculation fails
      // But log it for investigation
    }

    // Notify restaurant about confirmed order (payment verified)
    try {
      const restaurantId = order.restaurantId?.toString() || order.restaurantId;
      const restaurantName = order.restaurantName;

      // CRITICAL: Log detailed info before notification
      logger.info('🔔 CRITICAL: Attempting to notify restaurant about confirmed order:', {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        restaurantIdType: typeof restaurantId,
        orderRestaurantId: order.restaurantId,
        orderRestaurantIdType: typeof order.restaurantId,
        orderStatus: order.status,
        orderCreatedAt: order.createdAt,
        orderItems: order.items.map(item => ({ name: item.name, quantity: item.quantity }))
      });

      // Verify order has restaurantId before notifying
      if (!restaurantId) {
        logger.error('❌ CRITICAL: Cannot notify restaurant - order.restaurantId is missing!', {
          orderId: order.orderId,
          order: {
            _id: order._id?.toString(),
            restaurantId: order.restaurantId,
            restaurantName: order.restaurantName
          }
        });
        throw new Error('Order restaurantId is missing');
      }

      // Verify order has restaurantName before notifying
      if (!restaurantName) {
        logger.warn('⚠️ Order restaurantName is missing:', {
          orderId: order.orderId,
          restaurantId: restaurantId
        });
      }

      const notificationResult = await notifyRestaurantNewOrder(order, restaurantId);

      logger.info(`✅ Successfully notified restaurant about confirmed order: `, {
        orderId: order.orderId,
        restaurantId: restaurantId,
        restaurantName: restaurantName,
        notificationResult: notificationResult
      });
    } catch (notificationError) {
      logger.error(`❌ CRITICAL: Error notifying restaurant after payment verification: `, {
        error: notificationError.message,
        stack: notificationError.stack,
        orderId: order.orderId,
        orderMongoId: order._id?.toString(),
        restaurantId: order.restaurantId,
        restaurantName: order.restaurantName,
        orderStatus: order.status
      });
      // Don't fail payment verification if notification fails
      // Order is still saved and restaurant can fetch it via API
      // But log it as critical for debugging
    }

    logger.info(`Order payment verified: ${order.orderId} `, {
      orderId: order.orderId,
      paymentId: payment.paymentId,
      razorpayPaymentId
    });

    res.json({
      success: true,
      data: {
        order: {
          id: order._id.toString(),
          orderId: order.orderId,
          status: order.status
        },
        payment: {
          id: payment._id.toString(),
          paymentId: payment.paymentId,
          status: payment.status
        }
      }
    });
  } catch (error) {
    logger.error(`Error verifying order payment: ${error.message} `, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user orders
 */
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { status, limit = 20, page = 1 } = req.query;

    if (!userId) {
      logger.error('User ID not found in request');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Build query - MongoDB should handle string/ObjectId conversion automatically
    // But we'll try both formats to be safe
    const mongoose = (await import('mongoose')).default;
    const query = { userId };

    // If userId is a string that looks like ObjectId, also try ObjectId format
    if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
      query.$or = [
        { userId: userId },
        { userId: new mongoose.Types.ObjectId(userId) }
      ];
      delete query.userId; // Remove direct userId since we're using $or
    }

    // Add status filter if provided
    if (status) {
      if (query.$or) {
        // Add status to each $or condition
        query.$or = query.$or.map(condition => ({ ...condition, status }));
      } else {
        query.status = status;
      }
    }
    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    logger.info(`Fetching orders for user: ${userId}, query: ${JSON.stringify(query)} `);

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .select('-__v')
      .populate('restaurantId', 'name slug profileImage address location phone ownerPhone')
      .populate('userId', 'name phone email')
      .lean();

    const total = await Order.countDocuments(query);

    logger.info(`Found ${orders.length} orders for user ${userId}(total: ${total})`);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching user orders: ${error.message} `);
    logger.error(`Error stack: ${error.stack} `);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

/**
 * Get order details
 */
export const getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Try to find order by MongoDB _id or orderId (custom order ID)
    let order = null;

    // First try MongoDB _id if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      })
        .populate('restaurantId', 'name slug profileImage address location phone ownerPhone')
        .populate('deliveryPartnerId', 'name email phone')
        .populate('userId', 'name fullName phone email')
        .lean();
    }

    // If not found, try by orderId (custom order ID like "ORD-123456-789")
    if (!order) {
      const decodedId = id ? decodeURIComponent(id) : "";
      
      const normalized = normalizeOrderId(id);

      const variants = [id, decodedId, normalized];
      
      // Legacy compatibility: check for the "spaced" format explicitly if needed
      // Most of these are handled by normalizeOrderId, but we keep explicit check for old data
      if (normalized.startsWith("ORD-")) {
        const parts = normalized.split("-");
        if (parts.length === 3) {
          variants.push(`ORD - ${parts[1]} -${parts[2]} `);
        }
      }

      order = await Order.findOne({
        $or: [
          { orderId: normalized },
          { orderId: { $in: [...new Set(variants)] } }
        ],
        userId
      })
        .populate('restaurantId', 'name slug profileImage address location phone ownerPhone')
        .populate('deliveryPartnerId', 'name email phone')
        .populate('userId', 'name fullName phone email')
        .lean();
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get payment details
    const payment = await Payment.findOne({
      orderId: order._id
    }).lean();

    res.json({
      success: true,
      data: {
        order,
        payment
      }
    });
  } catch (error) {
    logger.error(`Error fetching order details: ${error.message} `);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

/**
 * Update delivery location for an order
 * PATCH /api/orders/:orderId/location
 */
export const updateOrderLocation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const payload = req.body || {};
    const hasDeliveryInstruction =
      Object.prototype.hasOwnProperty.call(payload, 'deliveryInstruction') &&
      typeof payload.deliveryInstruction === 'string';
    const deliveryInstruction = hasDeliveryInstruction ? payload.deliveryInstruction.trim() : null;
    const isInstructionOnlyPayload =
      Object.keys(payload).length === 1 && Object.prototype.hasOwnProperty.call(payload, 'deliveryInstruction');
    const address = payload.address || (isInstructionOnlyPayload ? null : payload);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    if (!hasDeliveryInstruction && (!address || typeof address !== 'object')) {
      return res.status(400).json({
        success: false,
        message: 'Address payload or delivery instruction is required'
      });
    }

    // Find order by MongoDB _id or orderId (custom order ID)
    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId) && orderId.length === 24) {
      order = await Order.findOne({
        _id: orderId,
        userId
      });
    }

    if (!order) {
      const decodedId = orderId ? decodeURIComponent(orderId) : "";
      const normalized = normalizeOrderId(orderId);
      const variants = [orderId, decodedId, normalized];

      if (normalized.startsWith("ORD-")) {
        const parts = normalized.split("-");
        if (parts.length === 3) {
          variants.push(`ORD - ${parts[1]} -${parts[2]} `);
        }
      }

      order = await Order.findOne({
        $or: [
          { orderId: normalized },
          { orderId: { $in: [...new Set(variants)] } }
        ],
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const allowedStatuses = new Set(['pending', 'confirmed', 'preparing']);
    if (!allowedStatuses.has(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Delivery location can only be updated while the order is pending, confirmed, or preparing'
      });
    }

    const deliveryStateStatus = order.deliveryState?.status;
    const deliveryPhase = order.deliveryState?.currentPhase;
    const isAssigned =
      !!order.deliveryPartnerId ||
      !!order.assignmentInfo?.deliveryPartnerId ||
      ['accepted', 'en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'delivered'].includes(deliveryStateStatus) ||
      ['en_route_to_pickup', 'at_pickup', 'en_route_to_delivery', 'completed'].includes(deliveryPhase);

    if (isAssigned) {
      return res.status(400).json({
        success: false,
        message: 'Delivery location cannot be updated after a delivery partner has been assigned'
      });
    }
    const hasAddressUpdate = !isInstructionOnlyPayload && !!address && typeof address === 'object';

    if (hasAddressUpdate) {
      const coordsFromAddress = (() => {
        if (Array.isArray(address?.location?.coordinates) && address.location.coordinates.length >= 2) {
          return address.location.coordinates;
        }
        if (Array.isArray(address?.coordinates) && address.coordinates.length >= 2) {
          return address.coordinates;
        }
        const lat = address?.lat ?? address?.latitude;
        const lng = address?.lng ?? address?.longitude;
        if (typeof lat === 'number' && typeof lng === 'number') {
          return [lng, lat];
        }
        return null;
      })();

      const existingCoords = order.address?.location?.coordinates;
      const nextCoords = coordsFromAddress || existingCoords;

      if (!nextCoords || !Array.isArray(nextCoords) || nextCoords.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Valid location coordinates are required'
        });
      }

      const updatedAddress = {
        ...(order.address || {}),
        ...(address || {})
      };

      updatedAddress.location = {
        ...(order.address?.location || {}),
        ...(address.location || {}),
        type: address.location?.type || order.address?.location?.type || 'Point',
        coordinates: nextCoords
      };

      if (address.formattedAddress !== undefined) updatedAddress.formattedAddress = address.formattedAddress;
      if (address.street !== undefined) updatedAddress.street = address.street;
      if (address.additionalDetails !== undefined) updatedAddress.additionalDetails = address.additionalDetails;
      if (address.city !== undefined) updatedAddress.city = address.city;
      if (address.state !== undefined) updatedAddress.state = address.state;
      if (address.zipCode !== undefined) updatedAddress.zipCode = address.zipCode;
      if (address.label !== undefined) updatedAddress.label = address.label;

      order.address = updatedAddress;
    }

    if (hasDeliveryInstruction) {
      if (deliveryInstruction.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Delivery instruction is too long (max 200 characters)'
        });
      }
      order.deliveryInstruction = deliveryInstruction;
    }

    await order.save();

    const responseAddress = {
      ...(order.address || {}),
      coordinates: order.address?.location?.coordinates || undefined
    };

    return res.json({
      success: true,
      message: hasAddressUpdate && hasDeliveryInstruction
        ? 'Delivery details updated'
        : (hasAddressUpdate ? 'Delivery location updated' : 'Delivery instruction updated'),
      data: {
        orderId: order.orderId || order._id?.toString(),
        address: responseAddress,
        deliveryInstruction: order.deliveryInstruction || ''
      }
    });
  } catch (error) {
    logger.error(`Error updating delivery location: ${error.message} `, {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to update delivery location'
    });
  }
};

/**
 * Cancel order by user
 * PATCH /api/order/:id/cancel
 */
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cancellation reason is required'
      });
    }

    // Find order by MongoDB _id or orderId
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id) && id.length === 24) {
      order = await Order.findOne({
        _id: id,
        userId
      });
    }

    if (!order) {
      const normalized = normalizeOrderId(id);
      const decodedId = id ? decodeURIComponent(id) : "";
      const variants = [id, decodedId, normalized];
      
      if (normalized.startsWith("ORD-")) {
        const parts = normalized.split("-");
        if (parts.length === 3) {
          variants.push(`ORD - ${parts[1]} -${parts[2]} `);
        }
      }

      order = await Order.findOne({
        $or: [
          { orderId: normalized },
          { orderId: { $in: [...new Set(variants)] } }
        ],
        userId
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Order is already cancelled'
      });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a delivered order'
      });
    }

    // Get payment method from order or payment record
    const paymentMethod = order.payment?.method;
    const payment = await Payment.findOne({ orderId: order._id });
    const paymentMethodFromPayment = payment?.method || payment?.paymentMethod;

    // Determine the actual payment method
    const actualPaymentMethod = paymentMethod || paymentMethodFromPayment;

    // Allow cancellation for all payment methods (Razorpay, COD, Wallet)
    // Only restrict if order is already cancelled or delivered (checked above)

    // Update order status
    order.status = 'cancelled';
    order.cancellationReason = reason.trim();
    order.cancelledBy = 'user';
    order.cancelledAt = new Date();
    await order.save();

    // Calculate refund amount only for online payments (Razorpay) and wallet
    // COD orders don't need refund since payment hasn't been made
    let refundMessage = '';
    if (actualPaymentMethod === 'razorpay' || actualPaymentMethod === 'wallet') {
      try {
        const { calculateCancellationRefund } = await import('../services/cancellationRefundService.js');
        await calculateCancellationRefund(order._id, reason);
        logger.info(`Cancellation refund calculated for order ${order.orderId} - awaiting admin approval`);
        refundMessage = ' Refund will be processed after admin approval.';
      } catch (refundError) {
        logger.error(`Error calculating cancellation refund for order ${order.orderId}: `, refundError);
        // Don't fail the cancellation if refund calculation fails
      }
    } else if (actualPaymentMethod === 'cash') {
      refundMessage = ' No refund required as payment was not made.';
    }

    // Notify restaurant about cancellation
    try {
      await notifyRestaurantOrderUpdate(order._id.toString(), 'cancelled');
    } catch (notifError) {
      console.error('Error notifying restaurant about user cancellation:', notifError);
    }

    res.json({
      success: true,
      message: `Order cancelled successfully.${refundMessage} `,
      data: {
        order: {
          orderId: order.orderId,
          status: order.status,
          cancellationReason: order.cancellationReason,
          cancelledAt: order.cancelledAt
        }
      }
    });
  } catch (error) {
    logger.error(`Error cancelling order: ${error.message} `, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order'
    });
  }
};

/**
 * Calculate order pricing
 */
export const calculateOrder = async (req, res) => {
  try {
    const { items, restaurantId, deliveryAddress, couponCode, deliveryFleet, useReferralCoins, coinsToUse } = req.body;
    // Route is public (no auth middleware) so req.user may be undefined
    const userId = req.user?.id || null;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must have at least one item'
      });
    }

    // Calculate pricing
    const pricing = await calculateOrderPricing({
      items,
      restaurantId,
      deliveryAddress,
      couponCode,
      deliveryFleet: deliveryFleet || 'standard',
      userId,
      useReferralCoins,
      coinsToUse
    });

    res.json({
      success: true,
      data: {
        pricing
      }
    });
  } catch (error) {
    logger.error(`Error calculating order pricing: ${error.message} `, {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to calculate order pricing',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
