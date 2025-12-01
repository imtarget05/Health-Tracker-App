import express from "express";
import { chatWithAI } from "../controllers/chat.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/chat", protectRoute, chatWithAI);

// Nếu muốn cho guest cũng chat được (bỏ protectRoute):
// router.post("/chat", chatWithAI);

export default router;
