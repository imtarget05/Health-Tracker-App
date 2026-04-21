import dotenv from "dotenv";

dotenv.config();

const REQUIRED_ENV_VARS = [
    "FIREBASE_API_KEY",
    "GOOGLE_CLIENT_ID",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",  // ✅ NEW: Refresh token secret
    "AI_SERVICE_URL",
    "AI_CHAT_API_KEY",
    // AI_API_KEY is optional: if set, backend will forward x-api-key to the AI service.
    // GMAIL_USER, GMAIL_PASSWORD are optional: use for email (requires app password)
    // SENDGRID_API_KEY is optional: use for email (production recommended)
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
export const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
export const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;  // ✅ NEW
export const NODE_ENV = process.env.NODE_ENV || "development";
export const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
export const AI_CHAT_API_KEY = process.env.AI_CHAT_API_KEY;
export const AI_API_KEY = process.env.AI_API_KEY || "";

// ✅ Email service configuration (optional)
export const GMAIL_USER = process.env.GMAIL_USER || "";
export const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD || "";
export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
export const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@health-tracker.com";
