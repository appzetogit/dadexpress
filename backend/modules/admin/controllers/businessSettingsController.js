import BusinessSettings from "../models/BusinessSettings.js";
import {
  successResponse,
  errorResponse,
} from "../../../shared/utils/response.js";
import { asyncHandler } from "../../../shared/middleware/asyncHandler.js";
import { uploadToCloudinary } from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";

/**
 * Get Business Settings (Public - for favicon, logo, company name)
 * GET /api/business-settings/public
 */
export const getBusinessSettingsPublic = asyncHandler(async (req, res) => {
  try {
    const settings = await BusinessSettings.getSettings();

    // Return only public-facing data with defaults if not set
    return successResponse(
      res,
      200,
      "Business settings retrieved successfully",
      {
        companyName: settings?.companyName || "Appzeto Food",
        logo: settings?.logo || { url: "", publicId: "" },
        favicon: settings?.favicon || { url: "", publicId: "" },
        phone: settings?.phone || { countryCode: "+91", number: "" },
        email: settings?.email || "",
      },
    );
  } catch (error) {
    console.error("Error fetching public business settings:", error);
    // Return default values instead of error
    return successResponse(
      res,
      200,
      "Business settings retrieved successfully",
      {
        companyName: "Appzeto Food",
        logo: { url: "", publicId: "" },
        favicon: { url: "", publicId: "" },
      },
    );
  }
});

/**
 * Get Business Settings (Admin - full data)
 * GET /api/admin/business-settings
 */
export const getBusinessSettings = asyncHandler(async (req, res) => {
  try {
    const settings = await BusinessSettings.getSettings();
    return successResponse(
      res,
      200,
      "Business settings retrieved successfully",
      settings,
    );
  } catch (error) {
    console.error("Error fetching business settings:", error);
    return errorResponse(res, 500, "Failed to fetch business settings");
  }
});

/**
 * Update Business Settings
 * PUT /api/admin/business-settings
 */
export const updateBusinessSettings = asyncHandler(async (req, res) => {
  try {
    let {
      companyName,
      email,
      phoneCountryCode,
      phoneNumber,
      address,
      state,
      pincode,
      region,
      maintenanceMode,
      restaurantReferral,
    } = req.body;

    if (typeof restaurantReferral === "string") {
      try {
        restaurantReferral = JSON.parse(restaurantReferral);
      } catch (error) {
        return errorResponse(res, 400, "Invalid restaurant referral settings payload");
      }
    }

    // Get existing settings
    let settings = await BusinessSettings.findOne();
    if (!settings) {
      settings = new BusinessSettings();
    }

    // Update basic fields
    if (companyName !== undefined) settings.companyName = companyName;
    if (email !== undefined) settings.email = email;

    // Initialize phone object if it doesn't exist
    if (!settings.phone) {
      settings.phone = {
        countryCode: "+91",
        number: "",
      };
    }

    if (phoneCountryCode !== undefined)
      settings.phone.countryCode = phoneCountryCode;
    if (phoneNumber !== undefined) settings.phone.number = phoneNumber;
    if (address !== undefined) settings.address = address;
    if (state !== undefined) settings.state = state;
    if (pincode !== undefined) settings.pincode = pincode;
    if (region !== undefined) settings.region = region;
    if (maintenanceMode !== undefined) {
      settings.maintenanceMode.isEnabled = maintenanceMode.isEnabled || false;
      if (maintenanceMode.startDate) {
        settings.maintenanceMode.startDate = new Date(
          maintenanceMode.startDate,
        );
      }
      if (maintenanceMode.endDate) {
        settings.maintenanceMode.endDate = new Date(maintenanceMode.endDate);
      }
    }

    if (restaurantReferral !== undefined) {
      if (!settings.restaurantReferral) {
        settings.restaurantReferral = {};
      }
      if (restaurantReferral.commissionPercentage !== undefined) {
        settings.restaurantReferral.commissionPercentage = restaurantReferral.commissionPercentage;
      }
      if (restaurantReferral.applyOn !== undefined) {
        settings.restaurantReferral.applyOn = restaurantReferral.applyOn;
      }
    }

    // Handle logo upload
    if (req.files && req.files.logo && req.files.logo.length > 0) {
      try {
        await initializeCloudinary();
        const logoFile = req.files.logo[0];

        // Validate file type
        const allowedMimeTypes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
        ];
        if (!allowedMimeTypes.includes(logoFile.mimetype)) {
          return errorResponse(
            res,
            400,
            "Invalid logo file type. Allowed: JPEG, PNG, WEBP",
          );
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024;
        if (logoFile.size > maxSize) {
          return errorResponse(res, 400, "Logo file size exceeds 5MB limit");
        }

        // Delete old logo from Cloudinary if exists
        if (settings.logo.publicId) {
          try {
            const { cloudinary } =
              await import("../../../config/cloudinary.js");
            await cloudinary.uploader.destroy(settings.logo.publicId);
          } catch (deleteError) {
            console.warn("Failed to delete old logo:", deleteError);
          }
        }

        // Upload new logo
        const logoResult = await uploadToCloudinary(logoFile.buffer, {
          folder: "appzeto/business/logo",
          resource_type: "image",
          transformation: [
            { width: 500, height: 500, crop: "limit" },
            { quality: "auto" },
          ],
        });

        settings.logo = {
          url: logoResult.secure_url,
          publicId: logoResult.public_id,
        };
      } catch (logoError) {
        console.error("Error uploading logo:", logoError);
        return errorResponse(res, 500, "Failed to upload logo");
      }
    }

    // Handle favicon upload
    if (req.files && req.files.favicon && req.files.favicon.length > 0) {
      try {
        await initializeCloudinary();
        const faviconFile = req.files.favicon[0];

        // Validate file type
        const allowedMimeTypes = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/webp",
          "image/x-icon",
          "image/vnd.microsoft.icon",
        ];
        if (!allowedMimeTypes.includes(faviconFile.mimetype)) {
          return errorResponse(
            res,
            400,
            "Invalid favicon file type. Allowed: JPEG, PNG, WEBP, ICO",
          );
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024;
        if (faviconFile.size > maxSize) {
          return errorResponse(res, 400, "Favicon file size exceeds 5MB limit");
        }

        // Delete old favicon from Cloudinary if exists
        if (settings.favicon.publicId) {
          try {
            const { cloudinary } =
              await import("../../../config/cloudinary.js");
            await cloudinary.uploader.destroy(settings.favicon.publicId);
          } catch (deleteError) {
            console.warn("Failed to delete old favicon:", deleteError);
          }
        }

        // Upload new favicon
        const faviconResult = await uploadToCloudinary(faviconFile.buffer, {
          folder: "appzeto/business/favicon",
          resource_type: "image",
          transformation: [
            { width: 64, height: 64, crop: "limit" },
            { quality: "auto" },
          ],
        });

        settings.favicon = {
          url: faviconResult.secure_url,
          publicId: faviconResult.public_id,
        };
      } catch (faviconError) {
        console.error("Error uploading favicon:", faviconError);
        return errorResponse(res, 500, "Failed to upload favicon");
      }
    }

    // Set updated by
    if (req.admin && req.admin._id) {
      settings.updatedBy = req.admin._id;
    }

    await settings.save();

    return successResponse(
      res,
      200,
      "Business settings updated successfully",
      settings,
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to update business settings");
  }
});

/**
 * Update Referral Settings
 * PUT /api/admin/business-settings/referral
 */
export const updateReferralSettings = asyncHandler(async (req, res) => {
  try {
    const referralPayload =
      req.body?.referral && typeof req.body.referral === "object"
        ? req.body.referral
        : req.body;

    const {
      isEnabled,
      referrerReward,
      refereeReward,
      minOrderValue,
      expiryDays,
      rewardExpiryDays,
      maxRedemptionPercentage,
    } = referralPayload;

    let settings = await BusinessSettings.findOne();
    if (!settings) {
      settings = new BusinessSettings();
    }

    if (!settings.referral) {
      settings.referral = {
        isEnabled: true,
        referrerReward: 100,
        refereeReward: 50,
        minOrderValue: 199,
        expiryDays: 30,
        maxRedemptionPercentage: 20
      };
    }

    if (isEnabled !== undefined) settings.referral.isEnabled = isEnabled;
    if (referrerReward !== undefined) settings.referral.referrerReward = referrerReward;
    if (refereeReward !== undefined) settings.referral.refereeReward = refereeReward;
    if (minOrderValue !== undefined) settings.referral.minOrderValue = minOrderValue;
    const resolvedExpiryDays =
      expiryDays !== undefined ? expiryDays : rewardExpiryDays;
    if (resolvedExpiryDays !== undefined) {
      settings.referral.expiryDays = resolvedExpiryDays;
    }
    if (maxRedemptionPercentage !== undefined) settings.referral.maxRedemptionPercentage = maxRedemptionPercentage;

    await settings.save();

    return successResponse(
      res,
      200,
      "Referral settings updated successfully",
      settings.referral
    );
  } catch (error) {
    console.error("Error updating referral settings:", error);
    return errorResponse(res, 500, "Failed to update referral settings");
  }
});
