import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware for different endpoints
 */

// Auth rate limiter: max 5 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req, res) => {
        // Skip rate limit for trusted endpoints if needed
        return false;
    },
});

// File upload rate limiter: max 10 uploads per day per user
export const uploadLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 10,
    message: 'Too many uploads, please try again tomorrow',
    keyGenerator: (req, res) => {
        // Use user ID if authenticated, otherwise IP
        return req.user?.uid || req.ip;
    },
});

// AI chat rate limiter: max 50 messages per day per user
export const aiChatLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 50,
    message: 'Too many AI requests today, please try again tomorrow',
    keyGenerator: (req, res) => {
        return req.user?.uid || req.ip;
    },
});

// General API rate limiter: max 100 requests per minute per user
export const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    keyGenerator: (req, res) => {
        return req.user?.uid || req.ip;
    },
});

export default {
    authLimiter,
    uploadLimiter,
    aiChatLimiter,
    generalLimiter,
};
