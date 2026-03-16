import mongoose from "mongoose";

const adminPushNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    zone: {
      type: String,
      default: "All",
      trim: true,
    },
    sendTo: {
      type: String,
      enum: ["Customer", "Delivery Man", "Restaurant"],
      required: true,
      default: "Customer",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    status: {
      type: Boolean,
      default: true,
    },
    sentStats: {
      successCount: { type: Number, default: 0 },
      failureCount: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

const AdminPushNotification = mongoose.model(
  "AdminPushNotification",
  adminPushNotificationSchema,
);

export default AdminPushNotification;

