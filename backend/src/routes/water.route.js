// src/routes/water.route.js
import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
    createWaterLog,
    getWaterLogsByDate,
} from "../controllers/water.controller.js";

const router = express.Router();

// POST /water       -> log 1 lần uống nước
router.post("/", protectRoute, createWaterLog);

// GET /water?date=  -> lấy log + tổng lượng nước trong ngày
router.get("/", protectRoute, getWaterLogsByDate);

export default router;
