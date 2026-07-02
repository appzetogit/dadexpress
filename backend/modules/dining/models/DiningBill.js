import mongoose from "mongoose";

const diningBillSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    billAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    discountApplied: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    paymentDetails: {
      method: { type: String, default: "razorpay" },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
      razorpaySignature: { type: String },
    },
    billId: {
      type: String,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

// Generate a random 8-character bill ID before saving
diningBillSchema.pre("save", function () {
  if (!this.billId) {
    this.billId =
      "BILL" + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
});

const DiningBill = mongoose.models.DiningBill || mongoose.model("DiningBill", diningBillSchema);
export default DiningBill;
