import multer from 'multer';
import { Readable } from 'stream';
import { cloudinary, initializeCloudinary } from '../../config/cloudinary.js';
import fs from 'fs';
import path from 'path';

// Use in‑memory storage; we stream to Cloudinary
const storage = multer.memoryStorage();

// Generic file filter for common image/video mime types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // images
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/svg+xml',
    // videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload an image or video.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

function getExtensionFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return 'bin';
  
  const hex = buffer.toString('hex', 0, 4).toUpperCase();
  if (hex === '89504E47') return 'png';
  if (hex.startsWith('FFD8FF')) return 'jpg';
  if (hex === '47494638') return 'gif';
  if (hex === '25504446') return 'pdf';
  
  // Check for WebP
  const riff = buffer.toString('ascii', 0, 4);
  const webp = buffer.toString('ascii', 8, 12);
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
  
  // Check for MP4
  const ftyp = buffer.toString('ascii', 4, 8);
  if (ftyp === 'ftyp') return 'mp4';
  
  // Check for SVG
  try {
    const snippet = buffer.toString('utf8', 0, Math.min(100, buffer.length)).trim().toLowerCase();
    if (snippet.startsWith('<svg') || snippet.includes('<svg') || snippet.startsWith('<?xml')) return 'svg';
  } catch (e) {
    // Ignore error
  }
  
  return 'jpg'; // Default to jpg as a safe default for images
}

/**
 * Upload a single buffer to local storage (mocking Cloudinary interface).
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - upload options (folder, resource_type, etc.)
 * @returns {Promise<Object>} Mock Cloudinary upload result
 */
export async function uploadToCloudinary(buffer, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Validate buffer
      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reject(new Error('Invalid buffer provided'));
      }
      if (buffer.length === 0) {
        return reject(new Error('Empty buffer provided'));
      }

      const folder = options.folder || 'appzeto';
      // Ensure target folder exists
      const targetDir = path.join(process.cwd(), 'uploads', folder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const ext = getExtensionFromBuffer(buffer);
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const filename = `${uniqueId}.${ext}`;
      const targetPath = path.join(targetDir, filename);

      fs.writeFileSync(targetPath, buffer);

      const publicId = `${folder}/${uniqueId}`;
      const secureUrl = `/uploads/${folder}/${filename}`;

      console.log('✅ Local file upload successful (mocked Cloudinary):', {
        publicId,
        url: secureUrl
      });

      resolve({
        public_id: publicId,
        secure_url: secureUrl,
        resource_type: options.resource_type || 'image',
        bytes: buffer.length,
        format: ext
      });
    } catch (error) {
      console.error('❌ Local file upload error:', error);
      reject(error);
    }
  });
}

/**
 * Delete a file from local storage by public ID (mocking Cloudinary interface).
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Mock Cloudinary deletion result
 */
export function deleteFromCloudinary(publicId) {
  return new Promise((resolve, reject) => {
    try {
      if (!publicId) return resolve({ result: 'not found' });

      const lastSlash = publicId.lastIndexOf('/');
      const folder = lastSlash !== -1 ? publicId.substring(0, lastSlash) : '';
      const uniqueId = lastSlash !== -1 ? publicId.substring(lastSlash + 1) : publicId;
      
      const targetDir = path.join(process.cwd(), 'uploads', folder);
      if (fs.existsSync(targetDir)) {
        const files = fs.readdirSync(targetDir);
        const match = files.find(f => f.startsWith(uniqueId));
        if (match) {
          fs.unlinkSync(path.join(targetDir, match));
          console.log(`✅ Locally deleted file: ${path.join(targetDir, match)}`);
          return resolve({ result: 'ok' });
        }
      }
      resolve({ result: 'not found' });
    } catch (error) {
      console.error('❌ Error deleting local file:', error);
      resolve({ result: 'error', error: error.message });
    }
  });
}

