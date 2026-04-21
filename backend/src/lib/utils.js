import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV } from "../config/env.js";

/**
 * Generate access token (short-lived: 1 hour)
 * @param {string} userId - User ID
 * @returns {string} JWT access token
 */
export const generateAccessToken = (userId) => {
    if (!JWT_SECRET || JWT_SECRET.length < 16) {
        throw new Error('JWT_SECRET not properly configured (minimum 16 characters)');
    }

    const token = jwt.sign({ userId, type: 'access' }, JWT_SECRET, {
        expiresIn: "1h",  // ✅ Reduced from 7 days to 1 hour for security
        algorithm: 'HS256',
    });
    return token;
};

/**
 * Generate refresh token (long-lived: 30 days)
 * @param {string} userId - User ID
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (userId) => {
    if (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 16) {
        throw new Error('JWT_REFRESH_SECRET not properly configured (minimum 16 characters)');
    }

    const token = jwt.sign({ userId, type: 'refresh' }, JWT_REFRESH_SECRET, {
        expiresIn: "30d",  // ✅ Longer expiry for refresh tokens
        algorithm: 'HS256',
    });
    return token;
};

/**
 * Generate token pair (access + refresh)
 * @param {string} userId - User ID
 * @param {object} res - Express response object (for setting cookies)
 * @returns {object} { accessToken, refreshToken, expiresIn }
 */
export const generateTokenPair = (userId, res) => {
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);

    // Set refresh token in secure cookie (httpOnly, secure, sameSite)
    res.cookie("refreshToken", refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
        httpOnly: true,  // ✅ Cannot be accessed via JavaScript
        sameSite: "strict",  // ✅ CSRF protection
        secure: NODE_ENV !== "development",  // ✅ HTTPS only in production
        path: "/auth/refresh",  // ✅ Limited to refresh endpoint
    });

    return {
        accessToken,
        refreshToken,  // Include in body for mobile clients
        expiresIn: 3600,  // 1 hour in seconds
        tokenType: "Bearer",
    };
};

/**
 * Older method for backward compatibility
 * Generates token pair including both tokens in cookie
 */
export const generateToken = (userId, res) => {
    return generateAccessToken(userId);
};

/**
 * Verify access token
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
    if (!JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET not configured');
    }
    return jwt.verify(token, JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
};

/**
 * Legacy method for backward compatibility
 */
export const verifyToken = (token) => {
    return verifyAccessToken(token);
};
