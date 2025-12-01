import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV_VARS = [
    "FIREBASE_API_KEY",
    "GOOGLE_CLIENT_ID",
    "JWT_SECRET",
    "AI_SERVICE_URL",
    "AI_CHAT_API_KEY",
    // Có thể thêm:
    // "FIREBASE_PROJECT_ID",
    // "FIREBASE_CLIENT_EMAIL",
    // "FIREBASE_PRIVATE_KEY",
    // "FIREBASE_STORAGE_BUCKET",
];

const missing = REQUIRED_ENV_VARS.filter(
    (key) => !process.env[key] || process.env[key].trim() === ""
);

if (missing.length > 0) {
    console.error("Missing required environment variables:", missing.join(", "));
    throw new Error("Missing required environment variables. Check your .env file.");
}

export const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const JWT_SECRET = process.env.JWT_SECRET;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
export const AI_CHAT_API_KEY = process.env.AI_CHAT_API_KEY;