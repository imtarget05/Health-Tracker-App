import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_CHAT_API_KEY } from "../config/env.js";

const genAI = new GoogleGenerativeAI(AI_CHAT_API_KEY);

// Model nhanh, rẻ để chat: "gemini-1.5-flash"
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// POST /ai/chat
// Body: { "message": "text user gửi", "context": "optional" }
export const chatWithAI = async (req, res) => {
  try {
    const user = req.user || null; // nếu em muốn bắt buộc login thì route dùng protectRoute
    const { message, context } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "message is required" });
    }

    // Build prompt: em có thể chỉnh thành "coach dinh dưỡng" ở đây
    const systemPrompt =
      "You are a friendly nutrition assistant for a Healthy Tracker app. " +
      "Answer shortly, in Vietnamese, and give practical advice about food, calories, and healthy lifestyle.";

    const fullPrompt = context
      ? `${systemPrompt}\n\nNgữ cảnh: ${context}\n\nNgười dùng: ${message}`
      : `${systemPrompt}\n\nNgười dùng: ${message}`;

    const result = await model.generateContent(fullPrompt);
    const aiText = result.response.text();

    return res.status(200).json({
      reply: aiText,
    });
  } catch (error) {
    console.error("Error in chatWithAI:", error);

    return res.status(500).json({
      message: "Failed to call AI chat service",
    });
  }
};
