import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
import express from 'express'; // Restarting to apply Firebase changes
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import mongoose from 'mongoose';
import { initializeFirebaseRealtime, initializeFirebaseRealtimeAsync } from './config/firebaseRealtime.js';
import { syncActiveOrderRealtime } from './modules/delivery/services/firebaseTrackingService.js';
import { getFirebaseRealtimeDb, isFirebaseRealtimeAvailable } from './config/firebaseRealtime.js';

// Load environment variables
dotenv.config();

console.log('Mongo URI:', process.env.MONGODB_URI);

// Initialize Firebase Realtime Database before routes/sockets start using it
initializeFirebaseRealtime();

// Import configurations
import { connectDB } from './config/database.js';
import { connectRedis } from './config/redis.js';

// Import middleware
import { errorHandler } from './shared/middleware/errorHandler.js';

// Import routes
import authRoutes from './modules/auth/index.js';
import userRoutes from './modules/user/index.js';
import restaurantRoutes from './modules/restaurant/index.js';
import deliveryRoutes from './modules/delivery/index.js';
import orderRoutes from './modules/order/index.js';
import orderLocationRoutes from './modules/order/routes/orderLocationRoutes.js';
import paymentRoutes from './modules/payment/index.js';
import menuRoutes from './modules/menu/index.js';
import campaignRoutes from './modules/campaign/index.js';
import notificationRoutes from './modules/notification/index.js';
import analyticsRoutes from './modules/analytics/index.js';
import adminRoutes from './modules/admin/index.js';
import categoryPublicRoutes from './modules/admin/routes/categoryPublicRoutes.js';
import feeSettingsPublicRoutes from './modules/admin/routes/feeSettingsPublicRoutes.js';
import envPublicRoutes from './modules/admin/routes/envPublicRoutes.js';
import aboutPublicRoutes from './modules/admin/routes/aboutPublicRoutes.js';
import businessSettingsPublicRoutes from './modules/admin/routes/businessSettingsPublicRoutes.js';
import termsPublicRoutes from './modules/admin/routes/termsPublicRoutes.js';
import privacyPublicRoutes from './modules/admin/routes/privacyPublicRoutes.js';
import refundPublicRoutes from './modules/admin/routes/refundPublicRoutes.js';
import shippingPublicRoutes from './modules/admin/routes/shippingPublicRoutes.js';
import cancellationPublicRoutes from './modules/admin/routes/cancellationPublicRoutes.js';
import feedbackPublicRoutes from './modules/admin/routes/feedbackPublicRoutes.js';
import feedbackExperiencePublicRoutes from './modules/admin/routes/feedbackExperiencePublicRoutes.js';
import safetyEmergencyPublicRoutes from './modules/admin/routes/safetyEmergencyPublicRoutes.js';
import zonePublicRoutes from './modules/admin/routes/zonePublicRoutes.js';
import subscriptionRoutes from './modules/subscription/index.js';
import uploadModuleRoutes from './modules/upload/index.js';
import locationRoutes from './modules/location/index.js';
import heroBannerRoutes from './modules/heroBanner/index.js';
import diningRoutes from './modules/dining/index.js';
import diningAdminRoutes from './modules/dining/routes/diningAdminRoutes.js';


// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingEnvVars = [];

requiredEnvVars.forEach(varName => {
  let value = process.env[varName];

  // Remove quotes if present (dotenv sometimes includes them)
  if (value && typeof value === 'string') {
    value = value.trim();
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }
  }

  // Update the env var with cleaned value
  if (value) {
    process.env[varName] = value;
  }

  // Check if valid
  if (!value || value === '' || (varName === 'JWT_SECRET' && value.includes('your-super-secret'))) {
    missingEnvVars.push(varName);
  }
});

if (missingEnvVars.length > 0) {
  console.error('❌ Missing or invalid required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}${varName === 'JWT_SECRET' ? ' (must be set to a secure value, not the placeholder)' : ''}`);
  });
  console.error('\nPlease update your .env file with valid values.');
  console.error('You can copy .env.example to .env and update the values.\n');
  process.exit(1);
}

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Allow all Dad Express Vercel preview deployments without listing each URL manually.
const isDadExpressVercelPreviewOrigin = (origin = '') =>
  /^https:\/\/dadexpress-[a-z0-9-]+\.vercel\.app$/i.test(origin);

const isMobileWebViewOrigin = (origin = '') => {
  if (!origin || typeof origin !== 'string') return false;
  const normalized = origin.toLowerCase();
  return (
    normalized.startsWith('capacitor://') ||
    normalized.startsWith('ionic://') ||
    normalized.startsWith('file://') ||
    normalized === 'null' ||
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('https://localhost')
  );
};

// Initialize Socket.IO with proper CORS configuration
const allowedSocketOrigins = [
  process.env.CORS_ORIGIN,
  'https://dadexpress-4e5fo5hel-appzetos-projects-70635cc3.vercel.app',
  'https://dadexpress.in',
  'https://www.dadexpress.in',
  'https://dadexpress-d2sed0c2w-appzetos-projects-70635cc3.vercel.app',

  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
].filter(Boolean); // Remove undefined values

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) {
        console.log('✅ Socket.IO: Allowing connection with no origin');
        return callback(null, true);
      }

      // Check if origin is in allowed list
      if (
        allowedSocketOrigins.includes(origin) ||
        isDadExpressVercelPreviewOrigin(origin) ||
        isMobileWebViewOrigin(origin)
      ) {
        console.log(`✅ Socket.IO: Allowing connection from: ${origin}`);
        callback(null, true);
      } else {
        // In development, allow all localhost origins
        if (process.env.NODE_ENV !== 'production') {
          if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            console.log(`✅ Socket.IO: Allowing localhost connection from: ${origin}`);
            return callback(null, true);
          }
          // Allow all origins in development for easier debugging
          console.log(`⚠️ Socket.IO: Allowing connection from: ${origin} (development mode)`);
          return callback(null, true);
        } else {
          console.error(`❌ Socket.IO: Blocking connection from: ${origin} (not in allowed list)`);
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  transports: ['polling', 'websocket'], // Polling first, then upgrade to websocket
  allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
  path: '/socket.io/', // Explicitly set Socket.IO path
  connectTimeout: 45000, // Increase connection timeout
  pingTimeout: 20000,
  pingInterval: 25000
});

// In-memory room-wise chat store for real-time chat history and delete operations.
// Keeps current behavior simple without affecting existing order/auth flows.
const chatRoomMessages = new Map();

function getChatRoomMessages(room) {
  return chatRoomMessages.get(room) || [];
}

function appendChatRoomMessage(room, message) {
  const existing = chatRoomMessages.get(room) || [];
  existing.push(message);
  chatRoomMessages.set(room, existing);
}

function clearChatRoomMessages(room) {
  chatRoomMessages.delete(room);
}

function removeChatRoomMessage(room, messageId) {
  const existing = chatRoomMessages.get(room) || [];
  const filtered = existing.filter((m) => String(m?._id) !== String(messageId));
  chatRoomMessages.set(room, filtered);
}

// Export getIO function for use in other modules
export function getIO() {
  return io;
}

// Restaurant namespace for order notifications
const restaurantNamespace = io.of('/restaurant');

// Add connection error handling before connection event
restaurantNamespace.use((socket, next) => {
  try {
    // Log connection attempt
    console.log('🍽️ Restaurant connection attempt:', {
      socketId: socket.id,
      auth: socket.handshake.auth,
      query: socket.handshake.query,
      origin: socket.handshake.headers.origin,
      userAgent: socket.handshake.headers['user-agent']
    });

    // Allow all connections - authentication can be handled later if needed
    // The token is passed in auth.token but we don't validate it here
    // to avoid blocking connections unnecessarily
    next();
  } catch (error) {
    console.error('❌ Error in restaurant namespace middleware:', error);
    next(error);
  }
});

restaurantNamespace.on('connection', (socket) => {
  console.log('🍽️ Restaurant client connected:', socket.id);
  console.log('🍽️ Socket auth:', socket.handshake.auth);
  console.log('🍽️ Socket query:', socket.handshake.query);
  console.log('🍽️ Socket headers:', socket.handshake.headers);

  // Restaurant joins their room
  socket.on('join-restaurant', (restaurantId) => {
    if (restaurantId) {
      // Normalize restaurantId to string (handle both ObjectId and string)
      const normalizedRestaurantId = restaurantId?.toString() || restaurantId;
      const room = `restaurant:${normalizedRestaurantId}`;

      // Log room join attempt with detailed info
      console.log(`🍽️ Restaurant attempting to join room:`, {
        restaurantId: restaurantId,
        normalizedRestaurantId: normalizedRestaurantId,
        room: room,
        socketId: socket.id,
        socketAuth: socket.handshake.auth
      });

      socket.join(room);
      const roomSize = restaurantNamespace.adapter.rooms.get(room)?.size || 0;
      console.log(`✅ Restaurant ${normalizedRestaurantId} joined room: ${room}`);
      console.log(`📊 Total sockets in room ${room}: ${roomSize}`);

      // Also join with ObjectId format if it's a valid ObjectId (for compatibility)
      if (mongoose.Types.ObjectId.isValid(normalizedRestaurantId)) {
        const objectIdRoom = `restaurant:${new mongoose.Types.ObjectId(normalizedRestaurantId).toString()}`;
        if (objectIdRoom !== room) {
          socket.join(objectIdRoom);
          const objectIdRoomSize = restaurantNamespace.adapter.rooms.get(objectIdRoom)?.size || 0;
          console.log(`✅ Restaurant also joined ObjectId room: ${objectIdRoom} (${objectIdRoomSize} sockets)`);
        }
      }

      // Send confirmation back to client
      socket.emit('restaurant-room-joined', {
        restaurantId: normalizedRestaurantId,
        room: room,
        socketId: socket.id
      });

      // Log all rooms this socket is now in
      const socketRooms = Array.from(socket.rooms).filter(r => r.startsWith('restaurant:'));
      console.log(`📋 Socket ${socket.id} is now in restaurant rooms:`, socketRooms);
    } else {
      console.warn('⚠️ Restaurant tried to join without restaurantId');
      console.warn('⚠️ Socket ID:', socket.id);
      console.warn('⚠️ Socket auth:', socket.handshake.auth);
    }
  });

  socket.on('disconnect', () => {
    console.log('🍽️ Restaurant client disconnected:', socket.id);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('🍽️ Restaurant socket error:', error);
  });
});

// Delivery namespace for order assignments
const deliveryNamespace = io.of('/delivery');

deliveryNamespace.on('connection', (socket) => {
  console.log('🚴 Delivery client connected:', socket.id);
  console.log('🚴 Socket auth:', socket.handshake.auth);

  // Delivery boy joins their room
  socket.on('join-delivery', (deliveryId) => {
    if (deliveryId) {
      // Normalize deliveryId to string (handle both ObjectId and string)
      const normalizedDeliveryId = deliveryId?.toString() || deliveryId;
      const room = `delivery:${normalizedDeliveryId}`;

      socket.join(room);
      console.log(`🚴 Delivery partner ${normalizedDeliveryId} joined room: ${room}`);
      console.log(`🚴 Total sockets in room ${room}:`, deliveryNamespace.adapter.rooms.get(room)?.size || 0);

      // Also join with ObjectId format if it's a valid ObjectId (for compatibility)
      if (mongoose.Types.ObjectId.isValid(normalizedDeliveryId)) {
        const objectIdRoom = `delivery:${new mongoose.Types.ObjectId(normalizedDeliveryId).toString()}`;
        if (objectIdRoom !== room) {
          socket.join(objectIdRoom);
          console.log(`🚴 Delivery partner also joined ObjectId room: ${objectIdRoom}`);
        }
      }

      // Send confirmation back to client
      socket.emit('delivery-room-joined', {
        deliveryId: normalizedDeliveryId,
        room: room,
        socketId: socket.id
      });
    } else {
      console.warn('⚠️ Delivery partner tried to join without deliveryId');
    }
  });

  // Chat functionality
  socket.on('join-chat-room', async (data) => {
    try {
      const { room, orderId, deliveryPartnerId, recipientId, chatType } = data;
      if (room) {
        socket.join(room);
        console.log(`💬 Delivery partner joined chat room: ${room}`);
        socket.emit('chat-room-joined', { room, orderId });
      }
    } catch (error) {
      console.error('❌ Error joining chat room:', error);
    }
  });

  socket.on('leave-chat-room', (data) => {
    try {
      const { room } = data;
      if (room) {
        socket.leave(room);
        console.log(`💬 Delivery partner left chat room: ${room}`);
      }
    } catch (error) {
      console.error('❌ Error leaving chat room:', error);
    }
  });

  socket.on('get-chat-messages', async (data) => {
    try {
      const { room, orderId } = data;
      // For now, return empty array - can be extended to fetch from database
      socket.emit('chat-messages', { room, orderId, messages: [] });
    } catch (error) {
      console.error('❌ Error getting chat messages:', error);
      socket.emit('chat-messages', { room: data.room, orderId: data.orderId, messages: [] });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      const { room, orderId, senderId, senderType, recipientId, recipientType, text, timestamp } = data;

      if (!room || !text || !senderId) {
        socket.emit('message-sent', { success: false, error: 'Invalid message data' });
        return;
      }

      const message = {
        _id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text,
        senderId,
        senderType: senderType || 'delivery',
        recipientId,
        recipientType: recipientType || 'customer',
        orderId,
        timestamp: timestamp || new Date().toISOString(),
        room
      };

      // Broadcast message to all clients in the room
      deliveryNamespace.to(room).emit('new-message', { room, message });

      // Also emit to user/restaurant namespaces if needed
      const userRoom = `user:${recipientId}`;
      const restaurantRoom = `restaurant:${recipientId}`;

      if (recipientType === 'customer') {
        io.to(userRoom).emit('new-message', { room, message });
      } else if (recipientType === 'restaurant') {
        const restaurantNamespace = io.of('/restaurant');
        restaurantNamespace.to(restaurantRoom).emit('new-message', { room, message });
      }

      socket.emit('message-sent', { success: true, message });
    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('message-sent', { success: false, error: error.message });
    }
  });

  socket.on('delete-chat-message', async (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      const messageId = data.messageId ? String(data.messageId) : '';
      if (!room || !messageId) {
        socket.emit('chat-delete-result', { success: false, error: 'Room and messageId are required' });
        return;
      }

      removeChatRoomMessage(room, messageId);
      deliveryNamespace.to(room).emit('message-deleted', { room, messageId });
      socket.emit('chat-delete-result', { success: true, room, messageId });
    } catch (error) {
      console.error('❌ Error deleting chat message:', error);
      socket.emit('chat-delete-result', { success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('🚴 Delivery client disconnected:', socket.id);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('🚴 Delivery socket error:', error);
  });
});

// Make io available to routes
app.set('io', io);

// Connect to databases
import { initializeCloudinary } from './config/cloudinary.js';

// Start server only after database is connected
connectDB().then(() => {
  // Retry realtime init after DB connection so admin-saved Firebase creds can be used too.
  initializeFirebaseRealtimeAsync().catch(err => console.error('Failed to initialize Firebase Realtime Database:', err));
  // Initialize Cloudinary after DB connection
  initializeCloudinary().catch(err => console.error('Failed to initialize Cloudinary:', err));

  // Start HTTP server
  const PORT = process.env.PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`✅ Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    
    // Initialize scheduled tasks only after successful DB connection
    initializeScheduledTasks();
  });
}).catch(err => {
  console.error('❌ CRITICAL ERROR: Database connection failed during startup:', err.message);
  process.exit(1);
});

// Redis connection is optional - only connects if REDIS_ENABLED=true
connectRedis().catch(() => {
  // Silently handle Redis connection failures
  // The app works without Redis
});

// Security middleware
app.use(helmet());
// CORS configuration - allow multiple origins
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'https://dadexpress-4e5fo5hel-appzetos-projects-70635cc3.vercel.app',
  'https://dadexpress.in',
  'https://www.dadexpress.in',
  'https://dadexpress-d2sed0c2w-appzetos-projects-70635cc3.vercel.app',
  'http://localhost:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      isDadExpressVercelPreviewOrigin(origin) ||
      isMobileWebViewOrigin(origin) ||
      process.env.NODE_ENV === 'development'
    ) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(null, true); // Allow in development, block in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Data sanitization
app.use(mongoSanitize());

// Rate limiting (disabled in development mode)
if (process.env.NODE_ENV === 'production') {
  // Trust proxy is required if the app is behind a reverse proxy (Nginx, Cloudflare, etc.)
  // Without this, all users might be seen as having the same IP adress
  // Set trust proxy to 1 (trust first proxy) for better security
  // If behind multiple proxies (e.g., Cloudflare + Nginx), set to the number of proxies
  const proxyCount = parseInt(process.env.TRUST_PROXY_COUNT) || 1;
  app.set('trust proxy', proxyCount);

  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5000, // limit each IP to 5000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Trust proxy must match Express trust proxy setting for security
    // If Express trusts proxy, rate limiter should also trust proxy
    trustProxy: true,
  });

  app.use('/api/', limiter);
  console.log(`Rate limiting enabled (production mode) with limit: 5000 requests/15min, trust proxy: ${proxyCount}`);
} else {
  console.log('Rate limiting disabled (development mode)');
}

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/order', orderRoutes);
app.use('/api', orderLocationRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/campaign', campaignRoutes);
app.use('/api/notification', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', categoryPublicRoutes);
app.use('/api', feeSettingsPublicRoutes);
app.use('/api/env', envPublicRoutes);
app.use('/api', aboutPublicRoutes);
app.use('/api', businessSettingsPublicRoutes);
app.use('/api', termsPublicRoutes);
app.use('/api', privacyPublicRoutes);
app.use('/api', refundPublicRoutes);
app.use('/api', shippingPublicRoutes);
app.use('/api', cancellationPublicRoutes);
app.use('/api', feedbackPublicRoutes);
app.use('/api', feedbackExperiencePublicRoutes);
app.use('/api', safetyEmergencyPublicRoutes);
app.use('/api', zonePublicRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api', uploadModuleRoutes);
app.use('/api/location', locationRoutes);
app.use('/api', heroBannerRoutes);
app.use('/api/dining', diningRoutes);
app.use('/api/admin/dining', diningAdminRoutes);

// 404 handler - but skip Socket.IO paths
app.use((req, res, next) => {
  // Skip Socket.IO paths - Socket.IO handles its own routing
  if (req.path.startsWith('/socket.io/') || req.path.startsWith('/restaurant') || req.path.startsWith('/delivery')) {
    return next();
  }

  // Log 404 errors for debugging (especially for admin routes)
  if (req.path.includes('/admin') || req.path.includes('refund')) {
    console.error('❌ [404 HANDLER] Route not found:', {
      method: req.method,
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      route: req.route?.path,
      registeredRoutes: 'Check server startup logs for route registration'
    });
    console.error('💡 [404 HANDLER] Expected route: POST /api/admin/refund-requests/:orderId/process');
    console.error('💡 [404 HANDLER] Make sure:');
    console.error('   1. Backend server has been restarted');
    console.error('   2. Route is registered (check startup logs)');
    console.error('   3. Authentication token is valid');
  }

  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method,
    expectedRoute: req.path.includes('refund') ? 'POST /api/admin/refund-requests/:orderId/process' : undefined
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const getRealtimeRouteForTrackingIds = async (trackingIds = []) => {
    try {
      if (isFirebaseRealtimeAvailable()) {
        const db = getFirebaseRealtimeDb();
        for (const trackingId of trackingIds) {
          const snap = await db.ref(`active_orders/${trackingId}`).once('value');
          const value = snap.val();
          if (value?.polyline) {
            return { orderId: trackingId, polyline: value.polyline };
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed reading realtime route: ${error.message}`);
    }

    try {
      const { getCachedRoute } = await import('./modules/delivery/services/locationProcessingService.js');
      for (const trackingId of trackingIds) {
        const cachedRoute = getCachedRoute(String(trackingId));
        if (cachedRoute?.polyline) {
          return {
            orderId: String(trackingId),
            polyline: cachedRoute.polyline,
            points: Array.isArray(cachedRoute.points) ? cachedRoute.points : undefined
          };
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed reading in-memory route cache: ${error.message}`);
    }

    return null;
  };

  const getTrackedOrderAndIds = async (rawOrderId) => {
    if (!rawOrderId) return { order: null, trackingIds: [] };
    const inputId = String(rawOrderId).trim();
    if (!inputId) return { order: null, trackingIds: [] };

    const { default: Order } = await import('./modules/order/models/Order.js');

    let order = null;
    if (mongoose.Types.ObjectId.isValid(inputId)) {
      order = await Order.findById(inputId)
        .populate({
          path: 'deliveryPartnerId',
          select: 'availability.currentLocation availability.lastLocationUpdate availability.isOnline'
        })
        .lean();
    }

    if (!order) {
      order = await Order.findOne({ orderId: inputId })
        .populate({
          path: 'deliveryPartnerId',
          select: 'availability.currentLocation availability.lastLocationUpdate availability.isOnline'
        })
        .lean();
    }

    const trackingIds = [...new Set(
      [inputId, order?._id?.toString(), order?.orderId]
        .filter(Boolean)
        .map((id) => String(id))
    )];

    return { order, trackingIds };
  };

  // Throttle Firebase sync to 10 seconds per order
  const firebaseSyncTimers = new Map(); // orderId -> timer

  // Delivery boy sends location update
  socket.on('update-location', async (data) => {
    try {
      // Validate data
      if (!data.orderId || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        console.error('Invalid location update data:', data);
        return;
      }

      // Broadcast location to customer tracking this order (all related IDs)
      const { trackingIds } = await getTrackedOrderAndIds(data.orderId);
      const emitIds = trackingIds.length ? trackingIds : [String(data.orderId)];

      const locationData = {
        orderId: data.orderId,
        lat: data.lat,
        lng: data.lng,
        heading: data.heading || 0,
        timestamp: Date.now()
      };

      emitIds.forEach((trackingId) => {
        // Send to specific order room (Socket.IO - real-time, 1-3 sec)
        io.to(`order:${trackingId}`).emit(`location-receive-${trackingId}`, locationData);
      });

      // Throttle Firebase sync to 10 seconds per order
      const orderId = data.orderId;
      if (!firebaseSyncTimers.has(orderId)) {
        // First update - sync immediately and set timer
        syncActiveOrderRealtime({
          orderId: orderId,
          boyId: data.deliveryId || null,
          boyLat: data.lat,
          boyLng: data.lng,
          status: 'on_the_way'
        }).catch((error) => {
          console.warn(`⚠️ Failed Firebase active_orders sync for ${orderId}: ${error.message}`);
        });

        // Set timer for next sync (10 seconds)
        const timer = setTimeout(() => {
          firebaseSyncTimers.delete(orderId);
        }, 10000); // 10 seconds

        firebaseSyncTimers.set(orderId, timer);
      } else {
        // Update pending location but don't sync yet (will sync after 10 sec)
        // Store latest location for next sync
        const timer = firebaseSyncTimers.get(orderId);
        clearTimeout(timer);

        // Set new timer with latest location
        const newTimer = setTimeout(() => {
          syncActiveOrderRealtime({
            orderId: orderId,
            boyId: data.deliveryId || null,
            boyLat: data.lat,
            boyLng: data.lng,
            status: 'on_the_way'
          }).catch((error) => {
            console.warn(`⚠️ Failed Firebase active_orders sync for ${orderId}: ${error.message}`);
          });
          firebaseSyncTimers.delete(orderId);
        }, 10000); // 10 seconds

        firebaseSyncTimers.set(orderId, newTimer);
      }

      console.log(`📍 Location broadcasted to order rooms: ${emitIds.join(', ')}`, {
        lat: locationData.lat,
        lng: locationData.lng,
        heading: locationData.heading
      });
    } catch (error) {
      console.error('Error handling location update:', error);
    }
  });

  // Customer joins order tracking room
  socket.on('join-order-tracking', async (orderId) => {
    if (!orderId) return;

    let trackedOrder = null;
    let trackingIds = [String(orderId)];

    try {
      const result = await getTrackedOrderAndIds(orderId);
      trackedOrder = result.order;
      trackingIds = result.trackingIds.length ? result.trackingIds : trackingIds;
    } catch (error) {
      console.error('Error resolving tracking order:', error.message);
    }

    trackingIds.forEach((trackingId) => {
      socket.join(`order:${trackingId}`);
    });
    console.log(`Customer joined order tracking rooms: ${trackingIds.join(', ')}`);

    try {
      const order = trackedOrder;
      if (order?.deliveryPartnerId?.availability?.currentLocation) {
        const coords = order.deliveryPartnerId.availability.currentLocation.coordinates;
        const locationData = {
          orderId: order.orderId || order._id?.toString() || String(orderId),
          lat: coords[1],
          lng: coords[0],
          heading: 0,
          timestamp: Date.now()
        };

        trackingIds.forEach((trackingId) => {
          socket.emit(`current-location-${trackingId}`, locationData);
        });
        console.log(`Sent current location to customer for order ids: ${trackingIds.join(', ')}`);
      }

      const realtimeRoute = await getRealtimeRouteForTrackingIds(trackingIds);
      if (realtimeRoute?.polyline) {
        trackingIds.forEach((trackingId) => {
          socket.emit(`route-polyline-${trackingId}`, {
            orderId: realtimeRoute.orderId,
            polyline: realtimeRoute.polyline
          });
        });
      }
    } catch (error) {
      console.error('Error sending current location:', error.message);
    }
  });

  // Handle request for current location
  socket.on('request-current-location', async (orderId) => {
    if (!orderId) return;

    try {
      const { order, trackingIds } = await getTrackedOrderAndIds(orderId);

      if (order?.deliveryPartnerId?.availability?.currentLocation) {
        const coords = order.deliveryPartnerId.availability.currentLocation.coordinates;
        const locationData = {
          orderId: order.orderId || order._id?.toString() || String(orderId),
          lat: coords[1],
          lng: coords[0],
          heading: 0,
          timestamp: Date.now()
        };

        const emitIds = trackingIds.length ? trackingIds : [String(orderId)];
        emitIds.forEach((trackingId) => {
          socket.emit(`current-location-${trackingId}`, locationData);
        });
        console.log(`Sent requested location for order ids: ${emitIds.join(', ')}`);
      }

      const realtimeRoute = await getRealtimeRouteForTrackingIds(trackingIds);
      if (realtimeRoute?.polyline) {
        (trackingIds.length ? trackingIds : [String(orderId)]).forEach((trackingId) => {
          socket.emit(`route-polyline-${trackingId}`, {
            orderId: realtimeRoute.orderId,
            polyline: realtimeRoute.polyline
          });
        });
      }
    } catch (error) {
      console.error('Error fetching current location:', error.message);
    }
  });

  // Delivery boy joins delivery room
  socket.on('join-delivery', (deliveryId) => {
    if (deliveryId) {
      socket.join(`delivery:${deliveryId}`);
      console.log(`Delivery boy joined: ${deliveryId}`);
    }
  });

  // Generic chat room support for user <-> delivery real-time chat
  socket.on('join-chat-room', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      if (!room) return;
      socket.join(room);
      socket.emit('chat-room-joined', { room, orderId: data.orderId || null });
      console.log(`💬 Socket joined chat room: ${room}`);
    } catch (error) {
      console.error('❌ Error joining chat room:', error);
    }
  });

  socket.on('leave-chat-room', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      if (!room) return;
      socket.leave(room);
      console.log(`💬 Socket left chat room: ${room}`);
    } catch (error) {
      console.error('❌ Error leaving chat room:', error);
    }
  });

  socket.on('get-chat-messages', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      const messages = room ? getChatRoomMessages(room) : [];
      socket.emit('chat-messages', {
        room,
        orderId: data.orderId || null,
        messages
      });
    } catch (error) {
      console.error('❌ Error getting chat messages:', error);
      socket.emit('chat-messages', { room: '', orderId: null, messages: [] });
    }
  });

  socket.on('send-message', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      const text = data.text ? String(data.text).trim() : '';
      if (!room || !text) return;

      const message = {
        _id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        text,
        senderId: data.senderId || null,
        senderType: data.senderType || 'user',
        recipientId: data.recipientId || null,
        recipientType: data.recipientType || null,
        orderId: data.orderId || null,
        timestamp: data.timestamp || new Date().toISOString(),
      };

      appendChatRoomMessage(room, message);
      io.to(room).emit('new-message', { room, message });

      // Notify admin inbox if it's a support message
      if (room.startsWith('support:admin:user:')) {
        io.to('admin-support-inbox').emit('incoming-support-message', { room, message });
      }

      socket.emit('message-sent', { success: true, message });
    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('message-sent', { success: false, error: error.message });
    }
  });

  socket.on('join-admin-support', () => {
    socket.join('admin-support-inbox');
    console.log('🛡️ Admin joined support inbox:', socket.id);
  });

  socket.on('get-support-conversations', () => {
    try {
      const conversations = [];
      for (const [room, messages] of chatRoomMessages.entries()) {
        if (room.startsWith('support:admin:user:')) {
          const userId = room.split(':').pop();
          const lastMsg = messages[messages.length - 1];
          conversations.push({
            id: room,
            room,
            userId,
            lastMessage: lastMsg?.text || '',
            timestamp: lastMsg?.timestamp || new Date().toISOString(),
            senderType: lastMsg?.senderType || 'user',
            unreadCount: 0 // Can be implemented with more complex logic
          });
        }
      }
      socket.emit('support-conversations-list', conversations);
    } catch (error) {
      console.error('❌ Error getting support conversations:', error);
    }
  });

  socket.on('delete-chat-message', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      const messageId = data.messageId ? String(data.messageId) : '';
      if (!room || !messageId) {
        socket.emit('chat-delete-result', { success: false, error: 'Room and messageId are required' });
        return;
      }

      removeChatRoomMessage(room, messageId);
      io.to(room).emit('message-deleted', { room, messageId });
      socket.emit('chat-delete-result', { success: true, room, messageId });
    } catch (error) {
      console.error('❌ Error deleting chat message:', error);
      socket.emit('chat-delete-result', { success: false, error: error.message });
    }
  });

  socket.on('delete-chat-room', (data = {}) => {
    try {
      const room = data.room ? String(data.room) : '';
      if (!room) {
        socket.emit('chat-delete-result', { success: false, error: 'Room is required' });
        return;
      }

      clearChatRoomMessages(room);
      io.to(room).emit('chat-deleted', {
        room,
        orderId: data.orderId || null,
        deletedBy: data.deletedBy || null,
        timestamp: new Date().toISOString()
      });
      socket.emit('chat-delete-result', { success: true, room });
    } catch (error) {
      console.error('❌ Error deleting chat room:', error);
      socket.emit('chat-delete-result', { success: false, error: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Scheduled tasks are now initialized from within the connectDB().then() block above

// Initialize scheduled tasks
function initializeScheduledTasks() {
  // Import menu schedule service
  import('./modules/restaurant/services/menuScheduleService.js').then(({ processScheduledAvailability }) => {
    // Run every minute to check for due schedules
    cron.schedule('* * * * *', async () => {
      try {
        const result = await processScheduledAvailability();
        if (result.processed > 0) {
          console.log(`[Menu Schedule Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Menu Schedule Cron] Error:', error);
      }
    });

    console.log('✅ Menu item availability scheduler initialized (runs every minute)');
  }).catch((error) => {
    console.error('❌ Failed to initialize menu schedule service:', error);
  });

  // Import auto-ready service
  import('./modules/order/services/autoReadyService.js').then(({ processAutoReadyOrders }) => {
    // Run every 30 seconds to check for orders that should be marked as ready
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const result = await processAutoReadyOrders();
        if (result.processed > 0) {
          console.log(`[Auto Ready Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Ready Cron] Error:', error);
      }
    });

    console.log('✅ Auto-ready order scheduler initialized (runs every 30 seconds)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-ready service:', error);
  });

  // Import auto-reject service
  import('./modules/order/services/autoRejectService.js').then(({ processAutoRejectOrders }) => {
    // Run every 30 seconds to check for orders that should be auto-rejected
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const result = await processAutoRejectOrders();
        if (result.processed > 0) {
          console.log(`[Auto Reject Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Auto Reject Cron] Error:', error);
      }
    });

    console.log('✅ Auto-reject order scheduler initialized (runs every 30 seconds)');
  }).catch((error) => {
    console.error('❌ Failed to initialize auto-reject service:', error);
  });

  // Import restaurant status service (Automatic Open/Close)
  import('./modules/restaurant/services/restaurantStatusService.js').then(({ processAutoStatusUpdates }) => {
    // Run every 30 seconds to check for restaurants that should be opened or closed
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const result = await processAutoStatusUpdates();
        if (result.opened > 0 || result.closed > 0) {
          console.log(`[Restaurant Status Cron] ${result.message}`);
        }
      } catch (error) {
        console.error('[Restaurant Status Cron] Error:', error);
      }
    });

    console.log('✅ Restaurant status sync scheduler initialized (runs every 30 seconds)');
  }).catch((error) => {
    console.error('❌ Failed to initialize restaurant status service:', error);
  });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  httpServer.close(() => {
    process.exit(1);
  });
});

export default app;
