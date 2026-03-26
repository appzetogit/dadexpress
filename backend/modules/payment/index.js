import express from 'express';
import { initializeRazorpay } from './services/razorpayService.js';

// Initialize Razorpay on module load (Removed - now handled in server.js after DB connection)
// initializeRazorpay();

const router = express.Router();

// Payment routes can be added here if needed
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Payment module is active',
    razorpayConfigured: !!process.env.RAZORPAY_KEY_ID
  });
});

export default router;

