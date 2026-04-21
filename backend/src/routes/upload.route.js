// src/routes/upload.route.js
import express from "express";
import upload, { validateFileMagicNumber } from "../middleware/upload.middleware.js";
import { uploadLimiter } from "../middleware/rate-limit.middleware.js";
import { uploadFileController, uploadAvatarController } from "../controllers/upload.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

// URL: /upload
// SECURITY: Apply rate limiting (10 uploads per day) and magic number validation
router.post("/", protectRoute, uploadLimiter, upload.single("file"), validateFileMagicNumber, uploadFileController);

// Dedicated avatar upload: POST /upload/avatar
router.post("/avatar", protectRoute, uploadLimiter, upload.single("file"), validateFileMagicNumber, uploadAvatarController);

export default router;
