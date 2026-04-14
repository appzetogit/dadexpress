import express from 'express';
import { reverseGeocode, getNearbyLocations } from '../controllers/locationController.js';

const router = express.Router();

// Reverse geocode coordinates to address
router.get('/reverse', reverseGeocode);

// Geocode address to coordinates
router.get('/geocode', (req, res, next) => {
    // Lazy import/load to avoid circular deps or early loading issues
    import('../controllers/locationController.js').then(m => m.geocode(req, res)).catch(next);
});

// Get nearby locations
router.get('/nearby', getNearbyLocations);

export default router;

