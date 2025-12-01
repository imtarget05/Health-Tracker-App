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
} from "../controllers/auth.controller.js";
import { facebookAuth, googleAuth } from "../controllers/oauth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();


// Đăng ký bằng email/password (qua Firebase Admin)
router.post("/register", signup);              // POST /auth/register

// Login chính thức: FE dùng Firebase Client SDK lấy idToken rồi gửi lên
router.post("/login", loginWithToken);         // POST /auth/login (client gửi idToken)

// Login extra: FE gửi thẳng email/password lên BE, BE tự gọi REST API Firebase Auth
// Nếu sau này không dùng thì chỉ cần xóa dòng dưới + bỏ import loginWithEmailPassword
router.post("/login-email", loginWithEmailPassword); // POST /auth/login-email

// Lấy thông tin user hiện tại (dựa trên JWT BE)
router.get("/me", protectRoute, checkAuth);    // GET /auth/me

// ===== Session / Profile =====
router.post("/logout", logout);                            // POST /auth/logout
router.put("/update-profile", protectRoute, updateProfile);// PUT /auth/update-profile

// ===== Password reset =====
router.post("/forgot-password", forgotPassword);   // POST /auth/forgot-password
router.post("/reset-password", resetPassword);     // POST /auth/reset-password

// ===== OAuth =====
router.post("/facebook", facebookAuth);            // POST /auth/facebook
router.post("/google", googleAuth);                // POST /auth/google

// ===== Test endpoints (dev) =====
router.get("/facebook/test", (req, res) => {
    res.json({
        message: "Facebook OAuth endpoint is working",
        note: "Use POST /auth/facebook with accessToken in body",
    });
});

router.get("/google/test", (req, res) => {
    res.json({
        message: "Google OAuth endpoint is ready",
        note: "Use POST /auth/google with Google ID token in body"
    });
});

export default router;
