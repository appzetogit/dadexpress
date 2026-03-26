import mongoose from 'mongoose';
import winston from 'winston';
import dns from 'dns';

// Fix for MongoDB Atlas SRV resolution issues on some DNS providers
// Adding Cloudflare DNS as well for better redundancy
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Ensure indexes are built automatically in development, disabled in production for performance
mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

/**
 * Connect to MongoDB with automatic retry on DNS/SRV timeout errors.
 * This provides a "permanent" fix for flaky networks and DNS resolution issues.
 */
export const connectDB = async (retryCount = 0) => {
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 2000; // 2 seconds between retries

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      family: 4, // Force IPv4 resolution (essential for fixing common SRV resolution issues in India/dual-stack)
      serverSelectionTimeoutMS: 60000, // 60s timeout for server selection
      connectTimeoutMS: 60000, // 60s initial connection timeout
      socketTimeoutMS: 60000,
      retryWrites: true,
      w: 'majority'
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error(`❌ MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected - attempting automatic reconnection...');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    const isTimeout = error.message.includes('ETIMEOUT') || 
                      error.message.includes('querySrv') || 
                      error.message.includes('buffering timed out') ||
                      error.message.includes('EAI_AGAIN');

    if (isTimeout && retryCount < MAX_RETRIES) {
      logger.warn(`⚠️ MongoDB connection attempt ${retryCount + 1} failed (DNS/Timeout). Retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return connectDB(retryCount + 1);
    }

    logger.error(`❌ Error connecting to MongoDB: ${error.message}`);
    if (error.message.includes('whitelist') || error.message.includes('ETIMEDOUT')) {
      logger.error('💡 PRO TIP: This often means your IP address is not whitelisted in MongoDB Atlas or Port 27017 is blocked.');
    }
    
    // Throw if all retries failed
    throw error; 
  }
};

export default connectDB;

