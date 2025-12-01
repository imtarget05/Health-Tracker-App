// src/routes/meal.route.js
import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
    createMealFromDetection,
    getMealsByDate,
} from "../controllers/meal.controller.js";

const router = express.Router();

// POST /meals/from-detection
router.post("/from-detection", protectRoute, createMealFromDetection);

// GET /meals?date=YYYY-MM-DD
router.get("/", protectRoute, getMealsByDate);

export default router;
