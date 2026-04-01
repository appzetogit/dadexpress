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
 * Record the usage of a coupon by a user
 * @param {Object} params - { userId, couponId }
 */
export const recordCouponUsage = async ({ userId, couponId }) => {
  try {
    // Current implementation is a placeholder to prevent ERR_MODULE_NOT_FOUND
    // and stop the server from crashing. In the future, this can be expanded 
    // to track coupon usage in a dedicated model.
    logger.info('Coupon usage recording attempted (placeholder implementation)', { userId, couponId });
    
    // Stub implementation - can be extended later with a CouponUsage model if needed
    return { success: true };
  } catch (error) {
    logger.error('Error recording coupon usage stub:', error);
    return { success: false, error: error.message };
  }
};
