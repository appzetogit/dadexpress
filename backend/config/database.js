import mongoose from 'mongoose';
import winston from 'winston';
import dns from 'dns';

// Fix for MongoDB Atlas SRV resolution issues on some DNS providers
dns.setServers(['8.8.8.8', '8.8.4.4']);

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

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 60000, // Wait 60 seconds (useful for Atlas elections)
      connectTimeoutMS: 60000,
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
      logger.warn('⚠️ MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error(`❌ Error connecting to MongoDB: ${error.message}`);
    if (error.message.includes('whitelist') || error.message.includes('ETIMEDOUT')) {
      logger.error('💡 PRO TIP: This often means your IP address is not whitelisted in MongoDB Atlas.');
    }
    throw error; // Let the caller handle it (e.g., exiting or waiting)
  }
};

export default connectDB;
