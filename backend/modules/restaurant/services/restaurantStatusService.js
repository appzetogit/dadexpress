import Restaurant from '../models/Restaurant.js';
import OutletTimings from '../models/OutletTimings.js';

/**
 * Automatically synchronize restaurant status with their outlet timings
 * This updates the isAcceptingOrders field in the database.
 */
export const processAutoStatusUpdates = async () => {
  try {
    // Process in batches to avoid overwhelming the database
    const restaurants = await Restaurant.find({ isActive: true }).select('_id isAcceptingOrders').lean();
    
    let opened = 0;
    let closed = 0;

    const results = await Promise.all(restaurants.map(async (r) => {
      try {
        const shouldBeOpen = await OutletTimings.isRestaurantOpen(r._id);
        const currentStatus = r.isAcceptingOrders;

        // If it should be closed but it's currently marked as accepting orders -> Close it
        if (!shouldBeOpen && currentStatus === true) {
          await Restaurant.findByIdAndUpdate(r._id, { isAcceptingOrders: false });
          return 'closed';
        } 
        
        /* 
        // If it should be open but it's currently marked as closed -> Open it
        // This handles "Na hi open ho rhe hai" issue.
        if (shouldBeOpen && currentStatus === false) {
          await Restaurant.findByIdAndUpdate(r._id, { isAcceptingOrders: true });
          return 'opened';
        }
        */

        return 'no-change';
      } catch (err) {
        console.error(`Error updating status for restaurant ${r._id}:`, err);
        return 'error';
      }
    }));

    results.forEach(res => {
      if (res === 'opened') opened++;
      if (res === 'closed') closed++;
    });

    return {
      processed: restaurants.length,
      opened,
      closed,
      message: `Checked ${restaurants.length} restaurants. Opened: ${opened}, Closed: ${closed}`
    };
  } catch (error) {
    console.error('Error in processAutoStatusUpdates:', error);
    throw error;
  }
};
