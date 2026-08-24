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

export async function notifyCustomerBookingStatusUpdate(booking) {
  try {
    const io = await getIOInstance();
    if (!io) {
      console.warn('Socket.IO not initialized, skipping customer dining notification');
      return;
    }

    const userId = booking.user?._id || booking.user;
    if (!userId) return;
    const normalizedUserId = userId.toString();

    const User = (await import('../../user/models/User.js')).default;
    const user = await User.findById(normalizedUserId).lean();
    if (!user) return;

    let statusText = booking.status;
    if (booking.status === 'cancelled') statusText = 'cancelled';
    else if (booking.status === 'confirmed') statusText = 'confirmed';
    
    // Emit socket event to user room
    const userRoom = `user:${normalizedUserId}`;
    io.to(userRoom).emit('table_booking_status_update', booking);

    // Send push notification via FCM for background handling
    const fcmTokensSet = new Set();
    if (user?.fcmToken) fcmTokensSet.add(JSON.stringify({ token: user.fcmToken, plat: 'web' }));
    if (user?.fcmTokenMobile) fcmTokensSet.add(JSON.stringify({ token: user.fcmTokenMobile, plat: 'app' }));

    const fcmTokens = Array.from(fcmTokensSet).map(s => JSON.parse(s));

    let title = 'Table Booking Update';
    let body = `Your table booking has been ${statusText}.`;

    if (booking.status === 'cancelled') {
       title = 'Table Booking Cancelled 🚫';
       body = `Your table booking on ${new Date(booking.date).toLocaleDateString()} at ${booking.timeSlot} has been cancelled.`;
    }

    for (const { token, plat } of fcmTokens) {
      notificationService.sendPushNotification(
        token,
        {
          title,
          body
        },
        {
          bookingId: booking._id.toString(),
          type: 'booking_status_update',
          click_action: '/user/dining'
        },
        plat || 'web'
      ).then(res => {
        if (res) console.log(`✅ Push notification sent for booking update to user ${normalizedUserId} (${plat})`);
      }).catch(err => {
        console.error(`❌ Failed to send push notification to user ${normalizedUserId}:`, err);
      });
    }

  } catch (error) {
    console.error('Failed to notify customer about booking status update:', error);
  }
}

