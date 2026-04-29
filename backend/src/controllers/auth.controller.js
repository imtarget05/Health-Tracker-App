// src/controllers/auth.controller.js
import { firebasePromise, getAuth, getDb } from "../lib/firebase.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fetch from "node-fetch";
import { generateToken, generateAccessToken, verifyRefreshToken } from "../lib/utils.js";
import { FIREBASE_API_KEY } from "../config/env.js";
import { sendPushToUser } from "../notifications/notification.service.js";
import { sendPasswordResetEmail } from "../lib/email.service.js";  // âœ… NEW
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

// Helper: láº¥y user profile tá»« Firestore
const getUserProfileByUid = async (uid) => {
  await firebasePromise;
  const db = getDb();
  const userDoc = await db.collection("users").doc(uid).get();
  return userDoc.exists ? userDoc.data() : null;
};

// Helper: verify email/password qua REST API cá»§a Firebase Auth
const verifyEmailPasswordWithFirebase = async (email, password) => {
  // ðŸ” DÃ¹ng FIREBASE_API_KEY Ä‘Ã£ validate sáºµn
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

// ============= SIGNUP HELPERS =============

// Helper: extract full name from email address
const _deriveFullName = (rawFullName, email) => {
  if (!rawFullName || String(rawFullName).trim() === '') {
    try {
      const derived = String(email).split('@')[0].replaceAll(/[._\d]+/g, ' ').trim();
      return derived || 'User';
    } catch (e) {
      console.warn('[signup] failed to derive fullName from email', e && (e.message || e));
      return 'User';
    }
  }
  return rawFullName;
};

// Helper: append content to an auth log file
const _appendAuthLog = (filename, content) => {
  try {
    fs.appendFileSync(path.join(os.tmpdir(), filename), content);
  } catch (e) {
    console.error('Failed to write auth log file', e && (e.message || e));
  }
};

// Helper: auto-login an existing account when email already exists during signup
const _handleSignupExistingEmail = async (email, password, db, auth, res, start) => {
  try {
    const signInData = await verifyEmailPasswordWithFirebase(email, password);
    const existingUid = signInData.localId;
    const existingProfile = await getUserProfileByUid(existingUid);
    if (!existingProfile) return res.status(400).json({ message: 'Email already exists' });
    const token = generateToken(existingUid, res);
    try { await db.collection('users').doc(existingUid).update({ lastLoginAt: new Date().toISOString() }); }
    catch (updErr) { console.warn('[signup] failed to update lastLoginAt', updErr && (updErr.message || updErr)); }
    try { await sendPushToUser({ userId: existingUid, type: NotificationType.AUTH_LOGIN, variables: {}, respectQuietHours: false }); }
    catch (notifyErr) { console.warn('[signup] login notification failed', notifyErr && (notifyErr.message || notifyErr)); }
    let customToken = null;
    try { await firebasePromise; customToken = await getAuth().createCustomToken(existingUid); }
    catch (tkErr) { console.warn('[signup] custom token failed for existing user', tkErr && (tkErr.message || tkErr)); }
    console.log(`[RES] POST /auth/register 200 (existing) - ${Date.now() - start}ms`);
    return res.status(200).json(buildUserResponse(existingProfile, token, customToken, true));
  } catch (signErr) {
    const fbCode = signErr?.firebaseCode || signErr?.code || null;
    if (fbCode === 'INVALID_PASSWORD') return res.status(401).json({ message: 'Invalid password' });
    return res.status(400).json({ message: 'Email already exists' });
  }
};

// Helper: create Firestore user profile, rolling back Firebase Auth user on failure
const _createFirestoreProfile = async (db, auth, uid, userProfile, res) => {
  try {
    console.log('[signup] writing user profile to Firestore', { uid });
    await db.collection("users").doc(uid).set(userProfile);
    console.log('[signup] Firestore write succeeded', { uid });
    return true;
  } catch (e) {
    console.error('[signup] Firestore write failed:', e?.message || e);
    try { await auth.deleteUser(uid); console.log('[signup] Rolled back auth user due to Firestore failure', { uid }); }
    catch (delErr) { console.error('[signup] Failed to rollback auth user:', delErr?.message || delErr); }
    res.status(500).json({ message: 'Failed to create user profile' });
    return false;
  }
};

// Helper: issue JWT token, rolling back Firebase Auth user on failure
const _issueSignupToken = async (auth, uid, res) => {
  try {
    return generateToken(uid, res);
  } catch (e) {
    console.error('[signup] Token generation failed:', e?.message || e);
    try { await auth.deleteUser(uid); console.log('[signup] Rolled back auth user due to token failure', { uid }); }
    catch (delErr) { console.error('[signup] Failed to rollback auth user after token failure:', delErr?.message || delErr); }
    res.status(500).json({ message: 'Failed to issue token' });
    return null;
  }
};

// Helper: send signup welcome notification and create Firebase custom token
const _sendSignupNotifications = async (uid) => {
  try { await sendPushToUser({ userId: uid, type: NotificationType.AUTH_SIGNUP, variables: {}, respectQuietHours: false }); }
  catch (e) { console.warn('[signup] failed to send welcome notification', e && (e.message || e)); }
  try { await firebasePromise; return await getAuth().createCustomToken(uid); }
  catch (tkErr) { console.warn('[signup] failed to create firebase custom token', tkErr && (tkErr.message || tkErr)); return null; }
};

// Helper: map signup top-level errors to HTTP responses
const _handleSignupError = (error, res) => {
  switch (error.code) {
    case "auth/email-already-exists": return res.status(400).json({ message: "Email already exists" });
    case "auth/weak-password": return res.status(400).json({ message: "Password is too weak" });
    case "auth/invalid-email": return res.status(400).json({ message: "Invalid email format" });
    default: return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Helper: map login email/password errors to HTTP responses
const _handleLoginEmailError = (error, res) => {
  if (error.firebaseCode) {
    switch (error.firebaseCode) {
      case "EMAIL_NOT_FOUND": return res.status(404).json({ message: "User not found" });
      case "INVALID_PASSWORD": return res.status(401).json({ message: "Invalid password" });
      case "INVALID_EMAIL": return res.status(400).json({ message: "Invalid email format" });
      default: return res.status(401).json({ message: "Invalid email or password" });
    }
  }
  return res.status(500).json({ message: "Internal server error" });
};

// ============= SIGNUP =============
export const signup = async (req, res) => {
  const start = Date.now();
  console.log('[REQ] POST /auth/register');
  let { fullName, email, password } = req.body;

  try {
    console.log('[signup] payload:', { fullName, email: email?.replace(/(.{3}).+(@.+)/, '$1***$2') });
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    fullName = _deriveFullName(fullName, email);

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    await firebasePromise;
    const auth = getAuth();
    const db = getDb();

    let userRecord;
    try {
      console.log('[signup] creating auth user for email=', email);
      userRecord = await auth.createUser({ email, password, displayName: fullName, emailVerified: false });
      console.log('[signup] auth.createUser succeeded', { uid: userRecord.uid });
    } catch (e) {
      const adminCode = e?.code || e?.errorInfo?.code || e?.firebaseCode || e?.message;
      console.error('[signup] Firebase Auth createUser failed:', { adminCode, message: e?.message || e, stack: e?.stack });
      _appendAuthLog('backend-signup-errors.log', `\n---- ${new Date().toISOString()} CREATEUSER ERROR ----\n${JSON.stringify({ adminCode, message: e?.message, stack: e?.stack }, null, 2)}\n`);
      if (adminCode && (adminCode === 'auth/email-already-exists' || adminCode === 'auth/email_exists')) {
        return _handleSignupExistingEmail(email, password, db, auth, res, start);
      }
      if (adminCode === 'auth/invalid-email') return res.status(400).json({ message: 'Invalid email format' });
      return res.status(500).json({ message: 'Failed to create user' });
    }

    const userProfile = { uid: userRecord.uid, email, fullName, profilePic: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const profileOk = await _createFirestoreProfile(db, auth, userRecord.uid, userProfile, res);
    if (!profileOk) return;

    const token = await _issueSignupToken(auth, userRecord.uid, res);
    if (!token) return;

    const customToken = await _sendSignupNotifications(userRecord.uid);
    console.log(`signup: created user uid=${userRecord.uid}`);
    console.log(`[RES] POST /auth/register 200 - ${Date.now() - start}ms`);
    return res.status(200).json(buildUserResponse(userProfile, token, customToken));
  } catch (error) {
    console.error("Error in signup controller:", error && (error.stack || error));
    console.debug('[signup] caught error details:', { name: error?.name, message: error?.message, code: error?.code || error?.firebaseCode });
    _appendAuthLog('backend-signup-errors.log', `\n---- ${new Date().toISOString()} ----\n${error && (error.stack || JSON.stringify(error))}\n`);
    return _handleSignupError(error, res);
  }
};

// ============= LOGIN Báº°NG EMAIL/PASSWORD (SERVER-SIDE) =============
// Náº¿u báº¡n muá»‘n login hoÃ n toÃ n qua API backend mÃ  khÃ´ng dÃ¹ng Firebase Client SDK trÃªn FE
export const loginWithEmailPassword = async (req, res) => {
  const { email, password } = req.body;
  const start = Date.now();
  console.log('[REQ] POST /auth/login-email');

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // DÃ¹ng REST API cá»§a Firebase Auth Ä‘á»ƒ verify email/password
    const data = await verifyEmailPasswordWithFirebase(email, password);
    const uid = data.localId;

    // Láº¥y user profile tá»« Firestore
    const userProfile = await getUserProfileByUid(uid);
    if (!userProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    // Generate JWT token cho há»‡ thá»‘ng
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
    _appendAuthLog('backend-auth-errors.log', `\n---- ${new Date().toISOString()} LOGIN-EMAIL ERROR ----\n${error && (error.stack || JSON.stringify(error))}\n`);
    return _handleLoginEmailError(error, res);
  }
};

// ============= LOGIN Báº°NG FIREBASE ID TOKEN (CLIENT SDK) =============
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
      fs.appendFileSync(path.join(os.tmpdir(), 'backend-auth-errors.log'), `\n---- ${new Date().toISOString()} LOGIN-TOKEN ERROR ----\n${error && (error.stack || JSON.stringify(error))}\n`);
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

    // Upload hoáº·c update avatar
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
    console.error("Error in update profile controller:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// ============= CHECK AUTH (GET /auth/me) =============
export const checkAuth = async (req, res) => {
  try {
    const user = req.user; // Ä‘Ã£ Ä‘Æ°á»£c set á»Ÿ protectRoute
    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    return res.status(200).json(user);
  } catch (error) {
    console.error("Error in check auth:", error);
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
    console.error("Error in logout controller:", error);
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

      // âœ… NEW: Send email with password reset link
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
        // âœ… Only show link in development for testing
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
    console.error("Error in forgot password:", error);
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

    // ðŸ” DÃ¹ng FIREBASE_API_KEY tá»« config
    const apiKey = FIREBASE_API_KEY;

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Reset password error:", data);
      return res.status(400).json({
        message: data.error?.message || "Invalid or expired reset code",
      });
    }

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error in reset password:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ============= REFRESH TOKEN (âœ… NEW) =============
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

