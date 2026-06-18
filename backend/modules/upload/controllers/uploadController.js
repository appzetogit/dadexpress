import { successResponse, errorResponse } from '../../../shared/utils/response.js';
import { uploadImage } from '../../../shared/services/storageService.js';

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

    console.log('📤 Uploading file to local storage:', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      bufferSize: req.file.buffer.length,
      folder
    });

    const result = await uploadImage(req.file.buffer, {
      folder,
      resource_type: 'auto',
    });

    if (!result || !result.secure_url) {
      throw new Error('Local upload failed: No secure_url in response');
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
    console.error('❌ Local upload error:', {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length
    });

    return errorResponse(res, 500, `File upload failed: ${error.message || 'Failed to upload file'}`);
  }
};


