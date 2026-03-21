import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadToCloudinary } from '../../../shared/utils/cloudinaryService.js';

export const uploadSingleMedia = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    // Validate file buffer
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, 'File buffer is empty or invalid');
    }

    const folder = req.body.folder || 'appzeto/uploads';

    console.log('📤 Uploading file to Cloudinary:', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer.length,
      folder
    });

    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: 'auto',
    });

    if (!result || !result.secure_url) {
      throw new Error('Cloudinary upload failed: No secure_url in response');
    }

    console.log('✅ File uploaded successfully:', {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type
    });

    return successResponse(res, 200, 'File uploaded successfully', {
      url: result.secure_url,
      secure_url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
      format: result.format
    });
  } catch (error) {
    console.error('❌ Cloudinary upload error:', {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length
    });

    const msg = error.message || '';
    const cloudinaryAuthFail =
      error.http_code === 401 ||
      /invalid signature|401/i.test(msg);
    const errorMessage = cloudinaryAuthFail
      ? 'Cloudinary rejected the upload (check CLOUDINARY_CLOUD_NAME, API key and secret are from the same account in .env or Admin ENV).'
      : msg || 'Failed to upload file';
    return errorResponse(res, 500, `File upload failed: ${errorMessage}`);
  }
};


