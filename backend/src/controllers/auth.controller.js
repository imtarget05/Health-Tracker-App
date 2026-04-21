// src/controllers/auth.controller.js
import { firebasePromise, getAuth, getDb } from "../lib/firebase.js";
import fs from "fs";
import fetch from "node-fetch";
import { generateAccessToken, generateRefreshToken, generateTokenPair, verifyRefreshToken } from "../lib/utils.js";
import { FIREBASE_API_KEY } from "../config/env.js";
import { sendPushToUser } from "../notifications/notification.service.js";
import { sendPasswordResetEmail } from "../lib/email.service.js";  // ✅ NEW
import { NotificationType } from "../notifications/notification.templates.js";
// Helper: build response user object
const buildUserResponse = (userProfile, token, firebaseCustomToken = null, existingAccount = false) => ({
  uid: userProfile.uid,
  fullName: userProfile.fullName,
  email: userProfile.email,
  profilePic: userProfile.profilePic || "",
  token,
  firebaseCustomToken,
  existingAccount,
});

// Helper: lấy user profile từ Firestore
const getUserProfileByUid = async (uid) => {
  await firebasePromise;
  const db = getDb();
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.exists ? userDoc.data() : null;
};

// Helper: verify email/password qua REST API của Firebase Auth
const verifyEmailPasswordWithFirebase = async (email, password) => {
  // 🔐 Dùng FIREBASE_API_KEY đã validate sẵn
  const apiKey = FIREBASE_API_KEY;

  // If running against the Auth emulator, call the emulator REST endpoint
  // The emulator exposes a REST-compatible endpoint at http://{host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake
  let url;
  if (process.env.USE_FIREBASE_EMULATOR === '1' || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
    url = `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`;
  } else {
    url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.error?.message || "Failed to sign in");
    err.firebaseCode = data.error?.message;
    throw err;
  }

  // data.localId = uid, data.idToken = Firebase ID token
  return data;
};

// ============= SIGNUP =============
export const signup = async (req, res) => {
  const start = Date.now();
  console.log('[REQ] POST /auth/register');
  let { fullName, email, password } = req.body;

  try {
    console.log('[signup] payload:', { fullName, email: email && email.replace(/(.{3}).+(@.+)/, '$1***$2') });
    console.log(`signup: received email=${email ? email.replace(/(.{3}).+(@.+)/, '$1***$2') : '<none>'}`);
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Nếu không có fullName từ FE, tự tạo 1 tên từ email (ví dụ: first part trước @)
    if (!fullName || String(fullName).trim() === '') {
      try {
        fullName = String(email).split('@')[0].replace(/[\._\d]+/g, ' ').trim();
        if (!fullName) fullName = 'User';
      } catch (e) {
        fullName = 'User';
      }
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    // Tạo user trong Firebase Auth
    await firebasePromise;
    const auth = getAuth();
    const db = getDb();

    let userRecord;
    try {
      console.log('[signup] creating auth user for email=', email);
      userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: false,
      });
      console.log('[signup] auth.createUser succeeded', { uid: userRecord.uid });
    } catch (e) {
      const adminCode = e?.code || e?.errorInfo?.code || e?.firebaseCode || e?.message;
      console.error('[signup] Firebase Auth createUser failed:', { adminCode, message: e?.message || e, stack: e?.stack });
      try {
        fs.appendFileSync('/tmp/backend-signup-errors.log', `\n---- ${new Date().toISOString()} CREATEUSER ERROR ----\n${JSON.stringify({ adminCode, message: e?.message, stack: e?.stack, raw: e }, null, 2)}\n`);
      } catch (logErr) {
        console.error('Failed to write signup error log file', logErr && (logErr.message || logErr));
      }
      // Map common admin errors to friendly responses
      if (adminCode && (adminCode === 'auth/email-already-exists' || adminCode === 'auth/email_exists')) {

        // Instead of failing signup, attempt to authenticate the provided credentials and
        // auto-login the user if the password is correct. This makes signup idempotent for
        // cases where the user already has an account.
        try {
          console.log('signup: attempting auto-login via Firebase REST signInWithPassword');
          const signInData = await verifyEmailPasswordWithFirebase(email, password);
          const existingUid = signInData.localId;
          const existingProfile = await getUserProfileByUid(existingUid);
          if (!existingProfile) return res.status(400).json({ message: 'Email already exists' });
          // generate token and return profile (acts as login)
          const token = generateToken(existingUid, res);
          // update lastLoginAt
          try { await db.collection('users').doc(existingUid).update({ lastLoginAt: new Date().toISOString() }); } catch (updErr) { console.warn('[signup] failed to update lastLoginAt for existing user', updErr && (updErr.message || updErr)); }
          // non-blocking welcome-back notification
          try {
            await sendPushToUser({ userId: existingUid, type: NotificationType.AUTH_LOGIN, variables: {}, respectQuietHours: false });
          } catch (notifyErr) { console.warn('[signup] failed to send login notification for existing user', notifyErr && (notifyErr.message || notifyErr)); }
          // attempt to create a Firebase custom token so FE can sign in the client SDK
          let firebaseCustomToken = null;
          try {
            await firebasePromise;
            firebaseCustomToken = await getAuth().createCustomToken(existingUid);
          } catch (tkErr) {
            console.warn('[signup] failed to create firebase custom token for existing user', tkErr && (tkErr.message || tkErr));
          }
          console.log(`signup: auto-login succeeded existingUid=${existingUid} tokenLen=${String(token).length} firebaseCustomTokenLen=${firebaseCustomToken ? firebaseCustomToken.length : 0}`);
          console.log(`[RES] POST /auth/register 200 - ${Date.now() - start}ms`);
          return res.status(200).json(buildUserResponse(existingProfile, token, firebaseCustomToken, true));
        } catch (signErr) {
          // If password was incorrect or sign-in failed, surface a clear message
          const fbCode = signErr?.firebaseCode || signErr?.code || null;
          if (fbCode === 'INVALID_PASSWORD' || fbCode === 'INVALID_PASSWORD') {
            return res.status(401).json({ message: 'Invalid password' });
          }
          return res.status(400).json({ message: 'Email already exists' });
        }
      }
      if (adminCode && adminCode === 'auth/invalid-email') {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      // fallback
      return res.status(500).json({ message: 'Failed to create user' });
    }

    // Tạo profile trong Firestore
    const userProfile = {
      uid: userRecord.uid,
      email,
      fullName,
      profilePic: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      console.log('[signup] writing user profile to Firestore', { uid: userRecord.uid });
      await db.collection("users").doc(userRecord.uid).set(userProfile);
      console.log('[signup] Firestore write succeeded', { uid: userRecord.uid });
    } catch (e) {
      console.error('[signup] Firestore write failed:', e?.message || e);
      // Attempt to cleanup created auth user to avoid orphaned accounts
      try {
        await auth.deleteUser(userRecord.uid);
        console.log('[signup] Rolled back created auth user due to Firestore failure', { uid: userRecord.uid });
      } catch (delErr) {
        console.error('[signup] Failed to rollback auth user:', delErr?.message || delErr);
      }
      return res.status(500).json({ message: 'Failed to create user profile' });
    }

    // Generate JWT token (set cookie)
    let token;
    try {
      token = generateToken(userRecord.uid, res);
    } catch (e) {
      console.error('[signup] Token generation failed:', e?.message || e);
      // Attempt to cleanup created auth user since token issuance failed
      try {
        await auth.deleteUser(userRecord.uid);
        console.log('[signup] Rolled back created auth user due to token failure', { uid: userRecord.uid });
      } catch (delErr) {
        console.error('[signup] Failed to rollback auth user after token failure:', delErr?.message || delErr);
      }
      return res.status(500).json({ message: 'Failed to issue token' });
    }

    console.log('[signup] success', { uid: userRecord.uid });
    // Send welcome notification (non-critical)
    try {
      await sendPushToUser({
        userId: userRecord.uid,
        type: NotificationType.AUTH_SIGNUP,
        variables: {},
        respectQuietHours: false,
      });
    } catch (e) {
      console.warn('[signup] failed to send welcome notification', e && (e.message || e));
    }
    // try to create a firebase custom token for the new user as well
    let firebaseCustomTokenNew = null;
    try {
      await firebasePromise;
      firebaseCustomTokenNew = await getAuth().createCustomToken(userRecord.uid);
    } catch (tkErr) {
      console.warn('[signup] failed to create firebase custom token for new user', tkErr && (tkErr.message || tkErr));
    }
    console.log(`signup: created user uid=${userRecord.uid} tokenLen=${String(token).length} firebaseCustomTokenLen=${firebaseCustomTokenNew ? firebaseCustomTokenNew.length : 0}`);
    console.log(`[RES] POST /auth/register 200 - ${Date.now() - start}ms`);
    return res.status(200).json(buildUserResponse(userProfile, token, firebaseCustomTokenNew));
  } catch (error) {
    console.error("Error in signup controller:", error && (error.stack || error));
    console.debug('[signup] caught error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code || error?.firebaseCode,
    });
    try {
      fs.appendFileSync(
        '/tmp/backend-signup-errors.log',
        `\n---- ${new Date().toISOString()} ----\n${error && (error.stack || JSON.stringify(error))}\n`
      );
    } catch (e) {
      console.error('Failed to write signup error file', e);
    }

    switch (error.code) {
      case "auth/email-already-exists":
        return res.status(400).json({ message: "Email already exists" });
      case "auth/weak-password":
        return res.status(400).json({ message: "Password is too weak" });
      case "auth/invalid-email":
        return res.status(400).json({ message: "Invalid email format" });
      default:
        return res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

// ============= LOGIN BẰNG EMAIL/PASSWORD (SERVER-SIDE) =============
// Nếu bạn muốn login hoàn toàn qua API backend mà không dùng Firebase Client SDK trên FE
export const loginWithEmailPassword = async (req, res) => {
  const { email, password } = req.body;
  const start = Date.now();
  console.log('[REQ] POST /auth/login-email');

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Dùng REST API của Firebase Auth để verify email/password
    const data = await verifyEmailPasswordWithFirebase(email, password);
    const uid = data.localId;

    // Lấy user profile từ Firestore
    const userProfile = await getUserProfileByUid(uid);
    if (!userProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    // Generate JWT token cho hệ thống
    const token = generateToken(uid, res);
    console.log(`loginWithEmailPassword: success uid=${uid} tokenLen=${String(token).length}`);
    console.log(`[RES] POST /auth/login-email 200 - ${Date.now() - start}ms`);

    // Update lastLoginAt for re-engagement logic
    try {
      await firebasePromise;
      const db = getDb();
      await db.collection('users').doc(uid).update({ lastLoginAt: new Date().toISOString() });
    } catch (e) {
      console.warn('[loginWithEmailPassword] failed to update lastLoginAt', e && (e.message || e));
    }

    // Send login welcome-back notification (non-blocking)
    try {
      await sendPushToUser({
        userId: uid,
        type: NotificationType.AUTH_LOGIN,
        variables: {},
        respectQuietHours: false,
      });
    } catch (e) {
      console.warn('[loginWithToken] failed to send welcome-back notification', e && (e.message || e));
    }

    // Try to create a firebase custom token for FE to sign in the client SDK
    let firebaseCustomToken = null;
    try {
      await firebasePromise;
      firebaseCustomToken = await getAuth().createCustomToken(uid);
    } catch (tkErr) {
      console.warn('[loginWithEmailPassword] failed to create firebase custom token', tkErr && (tkErr.message || tkErr));
    }

    return res.status(200).json(buildUserResponse(userProfile, token, firebaseCustomToken, true));
  } catch (error) {
    console.error("Error in email/password login:", error && (error.stack || error));
    try {
      fs.appendFileSync('/tmp/backend-auth-errors.log', `\n---- ${new Date().toISOString()} LOGIN-EMAIL ERROR ----\n${error && (error.stack || JSON.stringify(error))}\n`);
    } catch (e) {
      console.error('Failed to write auth error file', e);
    }

    if (error.firebaseCode) {
      switch (error.firebaseCode) {
        case "EMAIL_NOT_FOUND":
          return res.status(404).json({ message: "User not found" });
        case "INVALID_PASSWORD":
          return res.status(401).json({ message: "Invalid password" });
        case "INVALID_EMAIL":
          return res.status(400).json({ message: "Invalid email format" });
        default:
          return res.status(401).json({ message: "Invalid email or password" });
      }
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};

// ============= LOGIN BẰNG FIREBASE ID TOKEN (CLIENT SDK) =============
export const loginWithToken = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "ID token is required" });
    }

    await firebasePromise;
    const auth = getAuth();
    console.log('[loginWithToken] received idToken length=', typeof idToken === 'string' ? idToken.length : 0);
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
      console.log('[loginWithToken] verifyIdToken succeeded', { uid: decodedToken.uid });
    } catch (vdErr) {
      console.error('[loginWithToken] verifyIdToken failed:', vdErr?.message || vdErr);
      throw vdErr;
    }
    const uid = decodedToken.uid;

    const userProfile = await getUserProfileByUid(uid);
    if (!userProfile) {
      return res.status(404).json({ message: "User not found" });
    }

    const token = generateToken(uid, res);

    // create firebase custom token so FE can sign in client SDK
    let firebaseCustomToken = null;
    try {
      await firebasePromise;
      firebaseCustomToken = await getAuth().createCustomToken(uid);
    } catch (tkErr) {
      console.warn('[loginWithToken] failed to create firebase custom token', tkErr && (tkErr.message || tkErr));
    }

    return res.status(200).json(buildUserResponse(userProfile, token, firebaseCustomToken, true));
  } catch (error) {
    console.error("Error in login with token:", error && (error.stack || error));
    try {
      fs.appendFileSync('/tmp/backend-auth-errors.log', `\n---- ${new Date().toISOString()} LOGIN-TOKEN ERROR ----\n${error && (error.stack || JSON.stringify(error))}\n`);
    } catch (e) {
      console.error('Failed to write auth error file', e);
    }

    switch (error.code) {
      case "auth/id-token-expired":
        return res.status(401).json({ message: "Token expired" });
      case "auth/invalid-id-token":
        return res.status(401).json({ message: "Invalid token" });
      default:
        return res.status(401).json({ message: "Invalid token" });
    }
  }
};

// ============= UPDATE PROFILE =============
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, fullName } = req.body;
    const userId = req.user.uid;

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    // Upload hoặc update avatar
    if (profilePic) {
      updateData.profilePic = profilePic;
    }

    // Update fullname
    await firebasePromise;
    const auth = getAuth();
    const db = getDb();

    if (fullName) {
      updateData.fullName = fullName;
      await auth.updateUser(userId, { displayName: fullName });
    }

    await db.collection("users").doc(userId).update(updateData);

    const updatedUser = await getUserProfileByUid(userId);

    return res.status(200).json({
      uid: updatedUser.uid,
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      profilePic: updatedUser.profilePic || "",
    });
  } catch (error) {
    console.log("Error in update profile controller:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ============= CHECK AUTH (GET /auth/me) =============
export const checkAuth = async (req, res) => {
  try {
    const user = req.user; // đã được set ở protectRoute
    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.log("Error in check auth:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ============= LOGOUT =============
export const logout = async (req, res) => {
  try {
    res.clearCookie("jwt", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV !== "development",
    });

    // Optionally log a logout notification (do not push by default)
    try {
      const userId = req.user?.uid;
      if (userId) {
        // store a small notification record in DB (logout)
        await sendPushToUser({
          userId,
          type: NotificationType.AUTH_LOGOUT,
          variables: {},
          respectQuietHours: true,
        });
      }
    } catch (e) {
      console.warn('[logout] failed to log notification', e && (e.message || e));
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ============= FORGOT PASSWORD =============
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    await firebasePromise;
    const auth = getAuth();

    try {
      // Generate password reset link from Firebase
      const resetLink = await auth.generatePasswordResetLink(email);

      // ✅ NEW: Send email with password reset link
      try {
        await sendPasswordResetEmail(email, resetLink);
      } catch (emailError) {
        console.error('[forgotPassword] Email send failed:', emailError?.message);
        // Continue anyway - user can still use link from logs in development
        if (process.env.NODE_ENV === 'production') {
          return res.status(500).json({
            message: 'Failed to send reset email. Please try again later.',
          });
        }
      }

      return res.status(200).json({
        message: "Password reset link sent to email",
        // ✅ Only show link in development for testing
        resetLink: process.env.NODE_ENV === "development" ? resetLink : undefined,
      });
    } catch (firebaseError) {
      if (firebaseError.code === "auth/user-not-found") {
        // Don't reveal if user exists or not (security best practice)
        return res.status(200).json({
          message: "If an account exists, a reset link has been sent to your email",
        });
      }
      throw firebaseError;
    }
  } catch (error) {
    console.log("Error in forgot password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ============= RESET PASSWORD (REST API) =============
export const resetPassword = async (req, res) => {
  try {
    const { oobCode, newPassword } = req.body;

    if (!oobCode || !newPassword) {
      return res
        .status(400)
        .json({ message: "Reset code and new password are required" });
    }

    // 🔐 Dùng FIREBASE_API_KEY từ config
    const apiKey = FIREBASE_API_KEY;

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.log("Reset password error:", data);
      return res.status(400).json({
        message: data.error?.message || "Invalid or expired reset code",
      });
    }

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.log("Error in reset password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ============= REFRESH TOKEN (✅ NEW) =============
/**
 * Refresh access token using refresh token
 * POST /auth/refresh
 * Body: { refreshToken?: string }  (or from cookie)
 * Returns: { accessToken, expiresIn }
 */
export const refreshAccessToken = async (req, res) => {
  try {
    // Get refresh token from cookie or request body
    let refreshToken = req.cookies?.refreshToken;

    if (!refreshToken && req.body?.refreshToken) {
      refreshToken = req.body.refreshToken;
    }

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (error) {
      console.warn('[refreshAccessToken] Invalid/expired refresh token:', error?.message);
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const userId = decoded.userId;

    // Verify user still exists
    await firebasePromise;
    const db = getDb();
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(userId);

    return res.status(200).json({
      accessToken: newAccessToken,
      expiresIn: 3600,  // 1 hour in seconds
      tokenType: "Bearer",
    });
  } catch (error) {
    console.error("Error in refresh token:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
