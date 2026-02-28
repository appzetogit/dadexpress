import User from "../../auth/models/User.js";
import Delivery from "../../delivery/models/Delivery.js";
import Restaurant from "../../restaurant/models/Restaurant.js";
import notificationService from "../../../shared/services/notificationService.js";
import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";

// @desc    Send push notification to users, delivery men or restaurants
// @route   POST /api/admin/push-notification
// @access  Private/Admin
export const sendPushNotification = asyncHandler(async (req, res) => {
    let { title, description, zone, sendTo, imageUrl } = req.body;

    if (!title || !description || !sendTo) {
        return errorResponse(res, 400, "Title, description and target audience are required");
    }

    let tokens = [];

    // Filter by Zone
    const isAllZones = !zone || zone === "All";

    // Check if an image was uploaded
    let notificationImage = imageUrl || '/dadexpress.jpeg'; // default image specified by user
    if (req.file) {
        // If file uploaded via middleware
        notificationImage = req.file.path || req.file.url || notificationImage;
    }

    if (sendTo === "Customer") {
        const query = { fcmToken: { $exists: true, $ne: null } };
        // Could filter by zone if User schema supports it
        const users = await User.find(query).select('fcmToken');
        tokens = users.map(u => u.fcmToken);
    } else if (sendTo === "Delivery Man") {
        const query = { fcmToken: { $exists: true, $ne: null } };
        if (!isAllZones) {
            query["zone"] = { $regex: new RegExp(`^${zone}$`, 'i') };
        }
        const deliveryMen = await Delivery.find(query).select('fcmToken');
        tokens = deliveryMen.map(d => d.fcmToken);
    } else if (sendTo === "Restaurant") {
        const query = { fcmToken: { $exists: true, $ne: null } };
        if (!isAllZones) {
            query.$or = [
                { "location.area": { $regex: new RegExp(`^${zone}$`, 'i') } },
                { "location.city": { $regex: new RegExp(`^${zone}$`, 'i') } }
            ];
        }
        const restaurants = await Restaurant.find(query).select('fcmToken');
        tokens = restaurants.map(r => r.fcmToken);
    }

    // Clean tokens string
    tokens = tokens.filter(t => typeof t === 'string' && t.trim().length > 0);

    console.log(`[PUSH NOTIFICATION] Attempting to send to ${sendTo}. Zone: ${zone}`);
    console.log(`[PUSH NOTIFICATION] Found ${tokens.length} valid FCM tokens.`);

    if (tokens.length === 0) {
        console.log(`[PUSH NOTIFICATION] Skipped: No tokens found for ${sendTo}`);
        return successResponse(res, 200, `No active users found for ${sendTo} to send notifications to.`);
    }

    const notificationPayload = {
        title: title,
        body: description,
        image: notificationImage // The icon will be set to dadexpress.jpeg automatically in notificationService
    };

    console.log(`[PUSH NOTIFICATION] Payload:`, notificationPayload);

    // Firebase limits multicast to 500 tokens at a time.
    const batchSize = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += batchSize) {
        const batchTokens = tokens.slice(i, i + batchSize);
        const response = await notificationService.sendMulticastNotification(
            batchTokens,
            notificationPayload,
            { type: "admin_push", click_action: "/" }
        );
        if (response) {
            successCount += response.successCount;
            failureCount += response.failureCount;
        }
    }

    console.log(`[PUSH NOTIFICATION] Results - Success: ${successCount}, Failures: ${failureCount}`);

    return successResponse(res, 200, `Push notifications sent successfully! Delivered: ${successCount}, Failed: ${failureCount}`, {
        successCount,
        failureCount
    });
});
