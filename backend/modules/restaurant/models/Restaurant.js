import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { normalizePhoneNumber, normalizePhoneNumberE164 } from "../../../shared/utils/phoneUtils.js";

const locationSchema = new mongoose.Schema({
  latitude: Number,
  longitude: Number,
  // GeoJSON coordinates [longitude, latitude] for spatial queries
  coordinates: {
    type: [Number],
    default: undefined,
  },
  // Live address from Google Maps reverse geocoding
  formattedAddress: String,
  // Stored address fields
  address: String, // Full address string
  addressLine1: String,
  addressLine2: String,
  area: String,
  city: String,
  state: String,
  landmark: String,
  zipCode: String,
  pincode: String,
  postalCode: String,
  street: String,
});

const deliveryTimingsSchema = new mongoose.Schema({
  openingTime: String,
  closingTime: String,
});

const restaurantSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      unique: true,
    },
    // Authentication fields
    email: {
      type: String,
      required: function () {
        return !this.phone && !this.googleId;
      },
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true, // Allow multiple null values in unique index
    },
    phone: {
      type: String,
      required: function () {
        return !this.email && !this.googleId;
      },
      trim: true,
      unique: true,
      sparse: true,
    },
    // Consistent E.164-ish view of `phone` for comparisons/lookups, without breaking legacy `phone` format.
    phoneE164: {
      type: String,
      trim: true,
      default: null,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      select: false, // Don't return password by default
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    googleEmail: {
      type: String,
      sparse: true,
    },
    signupMethod: {
      type: String,
      enum: ["google", "phone", "email"],
      default: null,
    },
    // Owner information (now stored directly in restaurant)
    ownerName: {
      type: String,
      required: true,
    },
    ownerEmail: {
      type: String,
      default: "",
    },
    ownerPhone: {
      type: String,
      required: function () {
        return !!this.phone;
      },
    },
    ownerPhoneE164: {
      type: String,
      trim: true,
      default: null,
    },
    // Restaurant basic info
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    primaryContactNumber: String,
    primaryContactNumberE164: {
      type: String,
      trim: true,
      default: null,
    },
    location: locationSchema,
    profileImage: {
      url: String,
      publicId: String,
    },
    menuImages: [
      {
        url: String,
        publicId: String,
      },
    ],
    cuisines: [String],
    deliveryTimings: deliveryTimingsSchema,
    openDays: [String],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isAcceptingOrders: {
      type: Boolean,
      default: false,
    },
    // Explicit registration completion flag for onboarding redirect logic.
    // Backward compatible: legacy records may not have onboarding data; controllers compute a safe fallback.
    isProfileCompleted: {
      type: Boolean,
      default: false,
    },
    // Additional display data for user module
    estimatedDeliveryTime: {
      type: String,
      default: "",
    },
    distance: {
      type: String,
      default: "",
    },
    priceRange: {
      type: String,
      enum: ["$", "$$", "$$$", "$$$$"],
      default: "$$",
    },
    featuredDish: {
      type: String,
      default: "",
    },
    featuredPrice: {
      type: Number,
      default: 249,
    },
    offer: {
      type: String,
      default: "",
    },
    costForTwo: {
      type: Number,
      default: 1400,
    },
    tableBookingPrice: {
      type: Number,
      default: null,
    },
    // Onboarding fields (merged from RestaurantOnboarding)
    onboarding: {
      step1: {
        restaurantName: String,
        ownerName: String,
        ownerEmail: String,
        ownerPhone: String,
        primaryContactNumber: String,
        location: locationSchema,
      },
      step2: {
        menuImageUrls: [
          {
            url: String,
            publicId: String,
          },
        ],
        profileImageUrl: {
          url: String,
          publicId: String,
        },
        cuisines: [String],
        deliveryTimings: {
          openingTime: String,
          closingTime: String,
        },
        openDays: [String],
      },
      step3: {
        pan: {
          panNumber: String,
          nameOnPan: String,
          image: {
            url: String,
            publicId: String,
          },
        },
        gst: {
          isRegistered: {
            type: Boolean,
            default: false,
          },
          gstNumber: String,
          legalName: String,
          address: String,
          image: {
            url: String,
            publicId: String,
          },
        },
        fssai: {
          registrationNumber: String,
          expiryDate: Date,
          image: {
            url: String,
            publicId: String,
          },
        },
        bank: {
          accountNumber: String,
          ifscCode: String,
          accountHolderName: String,
          accountType: String,
        },
      },
      step4: {
        estimatedDeliveryTime: String,
        distance: String,
        priceRange: String,
        featuredDish: String,
        featuredPrice: Number,
        offer: String,
        tableBookingPrice: Number,
      },
      completedSteps: {
        type: Number,
        default: 0,
      },
      currentStep: {
        type: Number,
        default: 1,
      },
    },
    // Approval/Rejection fields
    rejectionReason: {
      type: String,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    diningSettings: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      maxGuests: {
        type: Number,
        default: 6,
      },
      diningType: {
        type: String,
        default: "family-dining", // e.g., 'fine-dining', 'cafe', 'casual-dining'
      },
    },
    businessModel: {
      type: String,
      enum: ["Commission Base", "Subscription Base"],
      default: "Commission Base",
    },
    fcmToken: {
      type: String,
      default: null,
    },
    fcmTokenMobile: {
      type: String,
      default: null,
    },
    platform: {
      type: String,
      enum: ["web", "ios", "android", "app"],
      default: "web",
    },
    // Referral information
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
    referredByName: {
      type: String,
      default: null,
    },
    referralCommission: {
      type: Number,
      default: null,
    },
    referralStatus: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// Note: email, phone, and googleId indexes are now defined at the field level

// geospatial index for location
restaurantSchema.index({ "location.coordinates": "2dsphere" });

// Hash password before saving
restaurantSchema.pre("save", async function () {
  // Generate restaurantId FIRST (before any validation)
  if (!this.restaurantId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    this.restaurantId = `REST-${timestamp}-${random}`;
  }

  // Ensure every restaurant has a unique referral code for refer-and-earn.
  if (!this.referralCode) {
    const RestaurantModel = this.constructor;
    const baseFromId = (this.restaurantId || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8) || "REST";
    let candidate = "";
    let attempts = 0;

    do {
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      candidate = `${baseFromId}${suffix}`;
      // eslint-disable-next-line no-await-in-loop
      const exists = await RestaurantModel.findOne({ referralCode: candidate }).select("_id").lean();
      if (!exists) break;
      attempts += 1;
    } while (attempts < 10);

    this.referralCode = candidate;
  }

  // Normalize phone number if it exists and is modified
  if (this.isModified("phone") && this.phone) {
    const normalized = normalizePhoneNumber(this.phone);
    if (normalized) {
      this.phone = normalized;
    }
    const e164 = normalizePhoneNumberE164(this.phone);
    this.phoneE164 = e164 || this.phoneE164 || null;
  }

  // Normalize ownerPhone if it exists and is modified
  if (this.isModified("ownerPhone") && this.ownerPhone) {
    const normalized = normalizePhoneNumber(this.ownerPhone);
    if (normalized) {
      this.ownerPhone = normalized;
    }
    const e164 = normalizePhoneNumberE164(this.ownerPhone);
    this.ownerPhoneE164 = e164 || this.ownerPhoneE164 || null;
  }

  // Normalize primaryContactNumber if it exists and is modified
  if (this.isModified("primaryContactNumber") && this.primaryContactNumber) {
    const normalized = normalizePhoneNumber(this.primaryContactNumber);
    if (normalized) {
      this.primaryContactNumber = normalized;
    }
    const e164 = normalizePhoneNumberE164(this.primaryContactNumber);
    this.primaryContactNumberE164 = e164 || this.primaryContactNumberE164 || null;
  }

  // Generate slug from name (always generate if name exists and slug doesn't)
  if (this.name && !this.slug) {
    let baseSlug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    // Ensure slug is not empty
    if (!baseSlug) {
      baseSlug = `restaurant-${this.restaurantId}`;
    }

    // Check for duplicate slug and generate unique one if needed
    let uniqueSlug = baseSlug;
    let counter = 1;
    const RestaurantModel = this.constructor;
    
    // Check if slug already exists (excluding current document if updating)
    const existingDoc = await RestaurantModel.findOne({ slug: uniqueSlug });
    if (existingDoc && (!this._id || existingDoc._id.toString() !== this._id.toString())) {
      // Slug exists, generate unique one
      while (true) {
        uniqueSlug = `${baseSlug}-${counter}`;
        const checkDoc = await RestaurantModel.findOne({ slug: uniqueSlug });
        if (!checkDoc || (this._id && checkDoc._id.toString() === this._id.toString())) {
          break; // Found unique slug
        }
        counter++;
      }
    }

    this.slug = uniqueSlug;
  }

  // CRITICAL: For phone signups, ensure email field is completely unset (not null/undefined)
  // This prevents duplicate key errors on sparse unique index
  if (
    this.phone &&
    !this.email &&
    (this.signupMethod === "phone" || !this.signupMethod)
  ) {
    // Explicitly ensure email is undefined (not null) to prevent MongoDB from indexing it
    // Mongoose will omit undefined fields but will include null fields
    if (this.email === null || this.email === undefined) {
      // Remove email from the document to prevent it from being saved
      this.$unset = this.$unset || {};
      this.$unset.email = "";
    }
  }

  // Hash password if it's modified
  if (this.isModified("password") && this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Set default ownerEmail if not set and phone exists
  if (!this.ownerEmail && this.phone && !this.email) {
    this.ownerEmail = `${this.phone.replace(/\D/g, "")}@restaurant.appzeto.com`;
  }
  if (this.email && !this.ownerEmail) {
    this.ownerEmail = this.email;
  }
});

// Method to compare password
restaurantSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.models.Restaurant || mongoose.model("Restaurant", restaurantSchema);
