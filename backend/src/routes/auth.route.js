// src/routes/auth.route.js
import express from "express";
import {
    signup,
    loginWithToken,
    logout,
    updateProfile,
    checkAuth,
    forgotPassword,
    resetPassword,
    loginWithEmailPassword,
    refreshAccessToken,  // ✅ NEW
} from "../controllers/auth.controller.js";
import { facebookAuth, googleAuth, facebookAuthTest } from "../controllers/oauth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { authLimiter } from "../middleware/rate-limit.middleware.js";
import { validateRequest, signupSchema, updateProfileSchema } from "../lib/validators.js";

const router = express.Router();

// SECURITY: Apply rate limiting to all auth endpoints to prevent brute force attacks
// 5 attempts per 15 minutes

// Đăng ký bằng email/password (qua Firebase Admin)
router.post("/register", authLimiter, validateRequest(signupSchema), signup);

// Login chính thức: FE dùng Firebase Client SDK lấy idToken rồi gửi lên
router.post("/login", authLimiter, loginWithToken);

// Login extra: FE gửi thẳng email/password lên BE, BE tự gọi REST API Firebase Auth
router.post("/login-email", authLimiter, loginWithEmailPassword);

// ✅ NEW: Refresh access token using refresh token
// POST /auth/refresh - no rate limit needed (only for authenticated users)
router.post("/refresh", refreshAccessToken);

// Lấy thông tin user hiện tại (dựa trên JWT BE)
router.get("/me", protectRoute, checkAuth);

// ===== Session / Profile =====
router.post("/logout", logout);
router.put("/update-profile", protectRoute, validateRequest(updateProfileSchema), updateProfile);

// ===== Password reset =====
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

// ===== OAuth =====
router.post("/facebook", authLimiter, facebookAuth);
router.post("/google", authLimiter, googleAuth);

// ===== Test endpoints (dev only) =====
router.get("/facebook/test", (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    res.json({ message: 'Facebook OAuth test endpoint' });
});

router.get("/google/test", (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    res.json({
        message: "Google OAuth endpoint is ready",
        note: "Use POST /auth/google with Google ID token in body"
    });
});

// Quick test endpoint to verify auth route + server wiring
router.get('/test', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    res.json({ message: 'Auth route is healthy' });
});

export default router;
