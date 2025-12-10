import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import mealRoutes from "./routes/meal.route.js";
import waterRoutes from "./routes/water.route.js";
import healthRoutes from "./routes/health.route.js";
import foodRoutes from "./routes/food.route.js";
import statsRoutes from "./routes/stats.route.js";
import aiRoutes from "./routes/ai.route.js";
import authRoutes from "./routes/auth.route.js";
import uploadRoutes from "./routes/upload.route.js";
import notificationRoutes from "./routes/notification.route.js";

import { firebasePromise } from "./lib/firebase.js";
import { startNotificationSchedulers } from "./notifications/notification.scheduler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(cookieParser());

// Quick request/response logger for debugging
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[REQ] ${req.method} ${req.url}`);
    res.on("finish", () => {
        const ms = Date.now() - start;
        console.log(`[RES] ${req.method} ${req.url} ${res.statusCode} - ${ms}ms`);
    });
    next();
});

const startServer = async () => {
    try {
        await firebasePromise;
        console.log("✅ Firebase Admin initialized");

        // Khởi chạy cron jobs cho notification
        // Use DISABLE_SCHEDULER=1 in development to avoid running cron tasks here
        const disableScheduler = process.env.DISABLE_SCHEDULER === '1' || process.env.DISABLE_SCHEDULER === 'true';
        if (disableScheduler) {
            console.log('Scheduler start skipped because DISABLE_SCHEDULER is set');
        } else {
            try {
                startNotificationSchedulers();
                console.log('Notification schedulers started');
            } catch (err) {
                console.error('Failed to start notification schedulers:', err);
            }
        }

        // ===== Mount tất cả routes =====
        app.use("/auth", authRoutes);          // /auth/...
        app.use("/upload", uploadRoutes);      // /upload
        app.use("/foods", foodRoutes);         // /foods/scan
        app.use("/meals", mealRoutes);         // /meals/from-detection, /meals?date=
        app.use("/water", waterRoutes);        // /water
        app.use("/health", healthRoutes);      // /health/profile, /health/stats/daily
        app.use("/stats", statsRoutes);        // /stats/daily, /stats/weekly, /stats/monthly
        app.use("/ai", aiRoutes);              // /ai/chat
        app.use("/notifications", notificationRoutes); // /notifications/test,...

        // Health check
        app.get("/api/health", (req, res) => {
            console.log('[HANDLER] /api/health handler invoked');
            // respond quickly
            res.setHeader('Content-Type', 'application/json');
            res.json({
                status: "OK",
                message: "Server is running",
                timestamp: new Date().toISOString(),
                database: "Firebase Firestore",
                firebase: "Initialized",
            });
        });

        // API index
        app.get("/api", (req, res) => {
            res.json({
                message: "Healthy Tracker API Endpoints",
                endpoints: [
                    // Auth
                    { method: "POST", path: "/auth/register", description: "Create user (email/password via Firebase)" },
                    { method: "POST", path: "/auth/login", description: "Login with Firebase ID token" },
                    { method: "GET", path: "/auth/me", description: "Check auth (JWT from backend)" },
                    { method: "POST", path: "/auth/facebook", description: "Facebook OAuth" },
                    { method: "POST", path: "/auth/google", description: "Google OAuth" },
                    { method: "PUT", path: "/auth/update-profile", description: "Update profile" },
                    { method: "POST", path: "/auth/logout", description: "Logout (clear JWT cookie)" },
                    { method: "POST", path: "/auth/forgot-password", description: "Send password reset email" },
                    { method: "POST", path: "/auth/reset-password", description: "Reset password via oobCode" },

                    // Upload & AI scan
                    { method: "POST", path: "/upload", description: "Upload file (image, etc.)" },
                    { method: "POST", path: "/foods/scan", description: "Scan food image with AI" },

                    // Meals
                    { method: "POST", path: "/meals/from-detection", description: "Create meal from AI detection" },
                    { method: "GET", path: "/meals?date=YYYY-MM-DD", description: "List meals by date" },

                    // Water
                    { method: "POST", path: "/water", description: "Log uống nước (amountMl)" },
                    { method: "GET", path: "/water?date=YYYY-MM-DD", description: "Danh sách log + tổng nước trong ngày" },

                    // Health profile & daily target
                    { method: "GET", path: "/health/profile", description: "Get health profile" },
                    { method: "PUT", path: "/health/profile", description: "Create/Update health profile & target calories" },
                    { method: "GET", path: "/health/stats/daily?date=YYYY-MM-DD", description: "Daily calories & water stats + suggestions" },

                    // Stats dashboard
                    { method: "GET", path: "/stats/daily?date=YYYY-MM-DD", description: "Daily summary" },
                    { method: "GET", path: "/stats/weekly?start=YYYY-MM-DD", description: "Weekly summary" },
                    { method: "GET", path: "/stats/monthly?month=YYYY-MM", description: "Monthly summary" },

                    // AI chat
                    { method: "POST", path: "/ai/chat", description: "Chat AI coach dinh dưỡng" },

                    // Notifications
                    { method: "GET", path: "/notifications/test", description: "Check notifications route (no auth)" },
                    { method: "POST", path: "/notifications/test", description: "Send test push notification (requires JWT)" },

                    // System
                    { method: "GET", path: "/api/health", description: "Server status" },
                ],
            });
        });

        app.listen(PORT, () => {
            console.log("🚀 Server is running on port:", PORT);
            console.log("🗄  Using Firebase Firestore for database");
        });
    } catch (error) {
        console.error("❌ Failed to initialize Firebase. Server not started.", error);
        process.exit(1);
    }
};

startServer();
