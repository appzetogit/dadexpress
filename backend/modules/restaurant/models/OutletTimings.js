import mongoose from 'mongoose';

const dayTimingSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  isOpen: {
    type: Boolean,
    default: true
  },
  openingTime: {
    type: String,
    default: '09:00 AM',
    // Format: "HH:MM AM/PM" or "HH:MM"
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty if closed
        // Match formats like "09:00 AM", "9:00 AM", "09:00", "9:00"
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/.test(v) || 
               /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Opening time must be in format HH:MM AM/PM or HH:MM'
    }
  },
  closingTime: {
    type: String,
    default: '10:00 PM',
    // Format: "HH:MM AM/PM" or "HH:MM"
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty if closed
        // Match formats like "10:00 PM", "22:00", etc.
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]\s?(AM|PM|am|pm)?$/.test(v) || 
               /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Closing time must be in format HH:MM AM/PM or HH:MM'
    }
  }
}, { _id: false });

const outletTimingsSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      unique: true
    },
    outletType: {
      type: String,
      enum: ['Appzeto delivery', 'Dining', 'Takeaway', 'All'],
      default: 'Appzeto delivery'
    },
    timings: {
      type: [dayTimingSchema],
      default: [
        { day: 'Monday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Tuesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Wednesday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Thursday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Friday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Saturday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' },
        { day: 'Sunday', isOpen: true, openingTime: '09:00 AM', closingTime: '10:00 PM' }
      ],
      validate: {
        validator: function(v) {
          // Ensure all 7 days are present
          if (v.length !== 7) return false;
          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
          const presentDays = v.map(t => t.day);
          return days.every(day => presentDays.includes(day));
        },
        message: 'All 7 days must be present in timings'
      }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
outletTimingsSchema.index({ restaurantId: 1, outletType: 1 });

// Ensure timings are always sorted by day order
outletTimingsSchema.pre('save', function(next) {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (this.timings && this.timings.length > 0) {
    this.timings.sort((a, b) => {
      return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    });
  }
  next();
});

// Helper to convert time string (HH:MM AM/PM or HH:MM) to minutes from midnight
const timeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM|am|pm)?$/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3];

  if (ampm) {
    const ampmUpper = ampm.toUpperCase();
    if (ampmUpper === 'PM' && hours < 12) hours += 12;
    if (ampmUpper === 'AM' && hours === 12) hours = 0;
  }
  return hours * 60 + minutes;
};

/**
 * Check if a restaurant is currently open based on its outlet timings
 * @param {mongoose.Types.ObjectId|string} restaurantId - The restaurant's identifier
 * @returns {Promise<boolean>}
 */
outletTimingsSchema.statics.isRestaurantOpen = async function(restaurantId) {
  try {
    const outletTimings = await this.findOne({ restaurantId, isActive: true });
    
    // If no timings are set, we default to open (to avoid blocking restaurants with legacy data)
    if (!outletTimings || !outletTimings.timings || outletTimings.timings.length === 0) {
      return true;
    }

    const now = new Date();
    // Use IST timezone (+5:30) as requested by user's location, or local server time
    // For consistency with India business, we can adjust to IST if server is UTC
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[istDate.getDay()];
    const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();

    const todayTiming = outletTimings.timings.find(t => t.day === currentDay);
    
    if (!todayTiming || !todayTiming.isOpen) {
      return false;
    }

    const openMin = timeToMinutes(todayTiming.openingTime);
    const closeMin = timeToMinutes(todayTiming.closingTime);

    if (openMin === null || closeMin === null) {
      return true; // Fallback if times are invalid
    }

    // Handle overnight timings (e.g., 10:00 PM to 04:00 AM)
    if (closeMin < openMin) {
      return currentMinutes >= openMin || currentMinutes <= closeMin;
    }

    return currentMinutes >= openMin && currentMinutes <= closeMin;
  } catch (error) {
    console.error('Error in OutletTimings.isRestaurantOpen:', error);
    return true; // Default to open on error
  }
};

const OutletTimings = mongoose.models.OutletTimings || mongoose.model('OutletTimings', outletTimingsSchema);

export default OutletTimings;

