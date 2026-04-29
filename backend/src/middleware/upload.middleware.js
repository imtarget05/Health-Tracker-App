// src/middleware/upload-middleware.js
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fileTypeFromBuffer } from "file-type";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload directory with size limits
const uploadTempDir = path.join(__dirname, "tmp");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

if (!fs.existsSync(uploadTempDir)) {
    fs.mkdirSync(uploadTempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadTempDir);
    },
    filename(req, file, cb) {
        const ext = path.extname(file.originalname);
        const uniqueName =
            Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1, // Only allow single file at a time
    },
    fileFilter(req, file, cb) {
        // Check file extension first
        const orig = file.originalname || '';
        const ext = path.extname(orig).toLowerCase();

        if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
            const err = new Error('Invalid file extension. Only jpg, png, webp, heic allowed');
            err.status = 400;
            return cb(err);
        }

        // Check MIME type
        const mimetype = file.mimetype || '';
        if (!mimetype.startsWith('image/')) {
            const err = new Error('Only image files are allowed');
            err.status = 400;
            return cb(err);
        }

        cb(null, true);
    },
});

/**
 * Enhanced file validation middleware
 * Validates magic numbers (file signatures) to prevent disguised malware
 */
export const validateFileMagicNumber = async (req, res, next) => {
    if (!req.file) {
        return next();
    }

    try {
        const filePath = req.file.path;
        const fileBuffer = fs.readFileSync(filePath);

        // Detect file type from magic numbers
        const fileType = await fileTypeFromBuffer(fileBuffer);

        if (!fileType) {
            // Could not determine file type - reject to be safe
            fs.unlinkSync(filePath);
            return res.status(400).json({
                message: 'Invalid file format - could not verify file type'
            });
        }

        // Verify detected type matches declared extension
        const declaredExt = path.extname(req.file.originalname).toLowerCase();
        const detectedMime = fileType.mime;

        if (!ALLOWED_MIME_TYPES.has(detectedMime)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                message: 'File type not allowed. Only JPEG, PNG, WebP allowed'
            });
        }

        // Optional: Check if declared extension matches detected type
        // This helps catch disguised files
        const mimeToExt = {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/webp': ['.webp'],
        };

        const validExts = mimeToExt[detectedMime] || [];
        if (!validExts.includes(declaredExt)) {
            console.warn(`[SECURITY] File extension mismatch: declared ${declaredExt}, detected ${detectedMime}`);
            // Optional: reject mismatches to be strictI'll allow it but log for monitoring
        }

        // Attach verified type to request
        req.file.verifiedMimeType = detectedMime;

        next();
    } catch (err) {
        console.error('Error validating file:', err);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({
            message: 'Error processing file'
        });
    }
};

// Cleanup temporary files periodically (every 24 hours)
let _cleanupInterval = null;

const cleanupOldUploads = () => {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    try {
        fs.readdirSync(uploadTempDir).forEach(file => {
            const filePath = path.join(uploadTempDir, file);
            try {
                const stat = fs.statSync(filePath);
                if (Date.now() - stat.mtimeMs > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`[Cleanup] Deleted old upload: ${file}`);
                }
            } catch (fileErr) {
                console.error(`[Cleanup] Error processing file ${file}:`, fileErr);
                // Continue processing other files
            }
        });
    } catch (err) {
        console.error('Error cleaning up uploads:', err);
    }
};

// Run cleanup every 6 hours
export const startUploadCleanup = () => {
    if (_cleanupInterval) return;
    _cleanupInterval = setInterval(cleanupOldUploads, 6 * 60 * 60 * 1000);
    console.log('[Upload] Cleanup scheduler started');
};

export const stopUploadCleanup = () => {
    if (_cleanupInterval) {
        clearInterval(_cleanupInterval);
        _cleanupInterval = null;
        console.log('[Upload] Cleanup scheduler stopped');
    }
};

export default upload;
