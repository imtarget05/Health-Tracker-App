// src/routes/health.route.js
import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getHealthProfile,
  upsertHealthProfile,
  getDailyStats,
} from "../controllers/health.controller.js";

const router = express.Router();

// GET /health/profile   -> lấy profile
router.get("/profile", protectRoute, getHealthProfile);

// PUT /health/profile   -> tạo / cập nhật profile + tính target_calories_per_day
router.put("/profile", protectRoute, upsertHealthProfile);

// GET /health/stats/daily?date=YYYY-MM-DD
router.get("/stats/daily", protectRoute, getDailyStats);

export default router;
