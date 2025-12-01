import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getDailyStats,
  getWeeklyStats,
  getMonthlyStats,
} from "../controllers/stats.controller.js";

const router = express.Router();

// GET /stats/daily?date=YYYY-MM-DD
router.get("/daily", protectRoute, getDailyStats);

// GET /stats/weekly?start=YYYY-MM-DD
router.get("/weekly", protectRoute, getWeeklyStats);

// GET /stats/monthly?month=YYYY-MM
router.get("/monthly", protectRoute, getMonthlyStats);

export default router;
