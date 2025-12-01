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
import { firebasePromise } from "./lib/firebase.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.json());
app.use(cookieParser());
app.use("/meals", mealRoutes);
app.use("/water", waterRoutes);
app.use("/health", healthRoutes);
app.use("/foods", foodRoutes);
app.use("/stats", statsRoutes);
app.use("/ai", aiRoutes);
const startServer = async () => {
    try {
        await firebasePromise;
        console.log("Firebase Admin initialized");
        app.use("/auth", authRoutes);
        app.use("/upload", uploadRoutes);
        app.get("/api/health", (req, res) => {
            res.json({
                status: "OK",
                message: "Server is running",
                timestamp: new Date().toISOString(),
                database: "Firebase Firestore",
                firebase: "Initialized",
            });
        });

        app.get("/api", (req, res) => {
            res.json({
                message: "Healthy Tracker API Endpoints",
                endpoints: [
                    { method: "GET", path: "/api/health", description: "Server status" },
                    { method: "POST", path: "/auth/register", description: "Create user (email/password via Firebase)" },
                    { method: "POST", path: "/auth/login", description: "Login with Firebase ID token" },
                    { method: "GET", path: "/auth/me", description: "Check auth (JWT from backend)" },
                    { method: "POST", path: "/auth/facebook", description: "Facebook OAuth" },
                    { method: "POST", path: "/auth/google", description: "Google OAuth" },
                    { method: "PUT", path: "/auth/update-profile", description: "Update profile" },
                    { method: "POST", path: "/auth/logout", description: "Logout (clear JWT cookie)" },
                    { method: "POST", path: "/auth/forgot-password", description: "Send password reset email" },
                    { method: "POST", path: "/auth/reset-password", description: "Reset password via oobCode" },
                    { method: "POST", path: "/upload", description: "Upload file (image, etc.)" },
                    { method: "POST", path: "/meals/from-detection", description: "Create meal from AI detection" },
                    { method: "GET", path: "/meals?date=YYYY-MM-DD", description: "List meals by date" },
                    { method: "POST", path: "/water", description: "Log uống nước (amountMl)" },
                    { method: "GET", path: "/water?date=YYYY-MM-DD", description: "Danh sách log + tổng nước trong ngày" },
                    { method: "GET", path: "/health/profile", description: "Get health profile" },
                    { method: "PUT", path: "/health/profile", description: "Create/Update health profile & target calories" },
                    { method: "GET", path: "/health/stats/daily?date=YYYY-MM-DD", description: "Daily calories & water stats + suggestions" },
                    { method: "GET", path: "/health/profile", description: "Get health profile" },
                    { method: "PUT", path: "/health/profile", description: "Create/Update health profile & target calories" },
                    { method: "GET", path: "/health/stats/daily?date=YYYY-MM-DD", description: "Daily calories & water stats + suggestions" },
                    { method: "GET", path: "/stats/daily?date=YYYY-MM-DD", description: "Daily calories & water summary"},
                    { method: "GET", path: "/stats/weekly?start=YYYY-MM-DD", description: "Weekly calories/water summary" },
                    { method: "GET", path: "/stats/monthly?month=YYYY-MM", description: "Monthly calories/water summary" },
                    { method: "POST", path: "/ai/chat", description: "Chat AI coach dinh dưỡng" },
                ],
            });
        });

        // Start server
        app.listen(PORT, () => {
            console.log("Server is running on port:", PORT);
            console.log("Using Firebase Firestore for database");
        });
    } catch (error) {
        console.error("Failed to initialize Firebase. Server not started.", error);
        process.exit(1);
    }
};

startServer();
