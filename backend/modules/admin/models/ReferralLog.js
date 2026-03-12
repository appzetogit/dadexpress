import mongoose from "mongoose";

const referralLogSchema = new mongoose.Schema(
    {
        referrer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        referee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "completed", "expired", "invalid"],
            default: "pending",
        },
        referrerReward: {
            type: Number,
            default: 0,
        },
        refereeReward: {
            type: Number,
            default: 0,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        expiryDate: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
referralLogSchema.index({ referrer: 1 });
referralLogSchema.index({ referee: 1 });
referralLogSchema.index({ status: 1 });

export default mongoose.models.ReferralLog || mongoose.model("ReferralLog", referralLogSchema);
