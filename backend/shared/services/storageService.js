import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Memory storage for multer processing
const storage = multer.memoryStorage();

// Multer filter to allow only common image formats
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Please upload a valid image.'), false);
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  }
});

/**
 * Maps the target folder name to standard subfolders: menu, restaurants, users, misc
 */
function getSubfolderFromOptions(options = {}) {
  const folder = (options.folder || '').toLowerCase();
  if (folder.includes('menu')) {
    return 'menu';
  }
  if (folder.includes('restaurant') || folder.includes('outlet')) {
    return 'restaurants';
  }
  if (folder.includes('user') || folder.includes('delivery') || folder.includes('profile') || folder.includes('staff')) {
    return 'users';
  }
  return 'misc';
}

/**
 * Uploads/saves an image buffer locally in WebP format
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Options containing folder and options
 * @returns {Promise<Object>} Object resembling Cloudinary response
 */
export async function uploadImage(buffer, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!buffer || !Buffer.isBuffer(buffer)) {
        return reject(new Error('Invalid image buffer provided'));
      }

      const subfolder = getSubfolderFromOptions(options);
      const targetDir = path.join(process.cwd(), 'images', subfolder);

      // Ensure target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filename = `${uuidv4()}.webp`;
      const targetPath = path.join(targetDir, filename);

      // Convert and optimize to WEBP format using Sharp
      let processedBuffer;
      try {
        processedBuffer = await sharp(buffer)
          .webp({ quality: 80, effort: 4 })
          .toBuffer();
      } catch (sharpError) {
        console.error('Sharp processing failed, falling back to original buffer writing:', sharpError);
        processedBuffer = buffer;
      }

      // Write optimized buffer to disk
      fs.writeFileSync(targetPath, processedBuffer);

      const publicId = `${subfolder}/${filename.replace('.webp', '')}`;
      const secureUrl = `/images/${subfolder}/${filename}`;

      console.log('✅ Image saved locally:', {
        publicId,
        url: secureUrl,
        size: processedBuffer.length
      });

      resolve({
        public_id: publicId,
        secure_url: secureUrl,
        url: secureUrl,
        format: 'webp',
        bytes: processedBuffer.length,
        resource_type: 'image'
      });
    } catch (error) {
      console.error('❌ Local image upload error:', error);
      reject(error);
    }
  });
}

/**
 * Deletes a local image using its public_id or URL
 * @param {string} publicId - Image public ID or URL
 * @returns {Promise<Object>} Status object
 */
export async function deleteImage(publicId) {
  return new Promise((resolve) => {
    try {
      if (!publicId) return resolve({ result: 'not found' });

      // Clean path if full relative URL is passed
      let relativePath = publicId;
      if (publicId.startsWith('/images/')) {
        relativePath = publicId.substring(8);
      }

      // Extract subfolder and filename
      const targetPath = path.join(process.cwd(), 'images', relativePath);
      
      // If it doesn't have .webp, check if we can delete it by looking up matches
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log(`✅ Locally deleted file: ${targetPath}`);
        return resolve({ result: 'ok' });
      }

      // Fallback search in directory (for files without extension in public_id)
      const lastSlash = relativePath.lastIndexOf('/');
      const subfolder = lastSlash !== -1 ? relativePath.substring(0, lastSlash) : '';
      const baseName = lastSlash !== -1 ? relativePath.substring(lastSlash + 1) : relativePath;

      const targetDir = path.join(process.cwd(), 'images', subfolder);
      if (fs.existsSync(targetDir)) {
        const files = fs.readdirSync(targetDir);
        const match = files.find(f => f.startsWith(baseName));
        if (match) {
          fs.unlinkSync(path.join(targetDir, match));
          console.log(`✅ Locally deleted matched file: ${path.join(targetDir, match)}`);
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

/**
 * Generates absolute or relative image URL
 * @param {string} pathOrPublicId - Path or publicId
 * @returns {string} Fully qualified or local URL
 */
export function generateImageUrl(pathOrPublicId) {
  if (!pathOrPublicId) return '';
  if (pathOrPublicId.startsWith('http://') || pathOrPublicId.startsWith('https://')) {
    return pathOrPublicId;
  }
  if (pathOrPublicId.startsWith('/images/')) {
    return pathOrPublicId;
  }
  return `/images/${pathOrPublicId}`;
}
