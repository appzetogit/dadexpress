import express from 'express';
import {
  submitSignupDetails,
  submitSignupDocuments
} from '../controllers/deliverySignupController.js';
import { authenticate } from '../middleware/deliveryAuth.js';
import { validate } from '../../../shared/middleware/validate.js';
import Joi from 'joi';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Signup routes
router.post('/signup/details', validate(Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().lowercase().trim().optional().allow(null, ''),
  address: Joi.string().trim().required(),
  city: Joi.string().trim().required(),
  state: Joi.string().trim().required(),
  pincode: Joi.string().trim().pattern(/^\d{6}$/).required(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  vehicleType: Joi.string().valid('bike', 'scooter', 'bicycle', 'car').required(),
  vehicleName: Joi.string().trim().optional().allow(null, ''),
  vehicleNumber: Joi.when('vehicleType', {
    is: 'bicycle',
    then: Joi.string().trim().optional().allow(null, ''),
    otherwise: Joi.string().trim().required()
  }),
  panNumber: Joi.string().trim().required(),
  aadharNumber: Joi.string().trim().required()
})), submitSignupDetails);

router.post('/signup/documents', validate(Joi.object({
  profilePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  aadharPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  panPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  drivingLicensePhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  aadharBackPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).required(),
  vehicleRCPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).optional().allow(null),
  vehicleRCBackPhoto: Joi.object({
    url: Joi.string().uri().required(),
    publicId: Joi.string().trim().required()
  }).optional().allow(null)
})), submitSignupDocuments);

export default router;

