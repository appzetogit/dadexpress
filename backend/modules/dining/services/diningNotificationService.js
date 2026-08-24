import mongoose from 'mongoose';
import notificationService from '../../../shared/services/notificationService.js';
import Restaurant from '../../restaurant/models/Restaurant.js';
import DiningRestaurant from '../models/DiningRestaurant.js';

let getIO = null;

async function getIOInstance() {
  if (!getIO) {
    const serverModule = await import('../../../server.js');
    getIO = serverModule.getIO;
  }
  return getIO ? getIO() : null;
}

export async function notifyRestaurantNewBooking(booking) {
  try {
    const io = await getIOInstance();
    if (!io) {
      console.warn('Socket.IO not initialized, skipping dining notification');
      return;
    }

    const restaurantId = booking.restaurant?._id || booking.restaurant;
    const normalizedRestaurantId = restaurantId?.toString() || restaurantId;

    let restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) {
      restaurant = await DiningRestaurant.findById(restaurantId).lean();
    }

    if (!restaurant) {
      console.error('Restaurant not found for dining notification:', restaurantId);
      return;
    }

    // Build notification payload
    const bookingDetails = {
      bookingId: booking._id.toString(),
      type: 'new_table_booking',
      click_action: '/restaurant/table-reservations',
      title: 'New Table Booking! 🍽️',
      body: `You have a new table booking for ${booking.guests} guest(s) at ${booking.timeSlot} on ${new Date(booking.date).toLocaleDateString()}.`
    };

    const restaurantNamespace = io.of('/restaurant');

    // Emit socket event to restaurant room
    const roomVariations = [
      `restaurant:${normalizedRestaurantId}`,
      ...(mongoose.Types.ObjectId.isValid(normalizedRestaurantId)
        ? [`restaurant:${new mongoose.Types.ObjectId(normalizedRestaurantId).toString()}`]
        : [])
    ];

    let socketsInRoom = [];
    for (const room of roomVariations) {
      const sockets = await restaurantNamespace.in(room).fetchSockets();
      if (sockets.length > 0) {
        socketsInRoom = sockets;
        break;
      }
    }

    const primaryRoom = roomVariations[0];
    
    // Broadcast via socket for foreground handling (toast & sound)
    restaurantNamespace.to(primaryRoom).emit('new_table_booking', booking);
    
    if (socketsInRoom.length > 0) {
      console.log(`📢 Emitted 'new_table_booking' to ${socketsInRoom.length} socket(s) in room ${primaryRoom}`);
    }

    // Send push notification via FCM for background handling
    const fcmTokensSet = new Set();
    if (restaurant?.fcmToken) fcmTokensSet.add(JSON.stringify({ token: restaurant.fcmToken, plat: 'web' }));
    if (restaurant?.fcmTokenMobile) fcmTokensSet.add(JSON.stringify({ token: restaurant.fcmTokenMobile, plat: 'app' }));

    const fcmTokens = Array.from(fcmTokensSet).map(s => JSON.parse(s));

    for (const { token, plat } of fcmTokens) {
      notificationService.sendPushNotification(
        token,
        {
          title: bookingDetails.title,
          body: bookingDetails.body
        },
        {
          bookingId: bookingDetails.bookingId,
          type: bookingDetails.type,
          click_action: bookingDetails.click_action
        },
        plat || 'web'
      ).then(res => {
        if (res) console.log(`✅ Push notification sent for booking to restaurant ${normalizedRestaurantId} (${plat})`);
      }).catch(err => {
        console.error(`❌ Failed to send push notification for booking to restaurant ${normalizedRestaurantId} (${plat}):`, err);
      });
    }

  } catch (error) {
    console.error('Failed to notify restaurant about new booking:', error);
  }
}
