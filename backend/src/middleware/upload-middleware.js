// src/middleware/upload-middleware.js
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// thư mục tạm ngay cạnh file middleware (hoặc bạn đổi theo ý)
const uploadTempDir = path.join(__dirname, "tmp");
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
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    },
});


export default upload;
