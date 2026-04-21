const { errorLogger, logError } = require('../lib/logger');

/**
 * Custom Error Class
 */
class AppError extends Error {
    constructor(statusCode, message, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Async error wrapper - catches errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Centralized error handling middleware
 * Should be registered as the LAST middleware
 */
const errorHandlingMiddleware = (err, req, res, next) => {
    // Default error values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let details = err.details || {};

    // Log error with context
    logError(err, {
        method: req.method,
        path: req.path,
        userId: req.user?.userId || 'anonymous',
        ip: req.ip,
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        // Joi validation errors
        statusCode = 400;
        message = 'Validation failed';
        details = {
            validationErrors: err.details.map(d => ({
                field: d.context.key,
                message: d.message,
            })),
        };
    } else if (err.name === 'UnauthorizedError') {
        // JWT auth errors
        statusCode = 401;
        message = 'Unauthorized';
        details = { reason: err.message };
    } else if (err.name === 'CastError') {
        // MongoDB/Firestore cast errors
        statusCode = 400;
        message = 'Invalid ID format';
        details = { field: err.path };
    } else if (err.code === 'ENOTFOUND') {
        // Network errors
        statusCode = 502;
        message = 'Service unavailable';
        details = { service: err.hostname };
    }

    // Production vs Development error responses
    const response = {
        success: false,
        statusCode,
        message,
        timestamp: new Date().toISOString(),
        requestId: req.id, // If using uuid middleware
    };

    // Include details in development, exclude in production
    if (process.env.NODE_ENV !== 'production') {
        response.details = details;
        response.stack = process.env.NODE_ENV === 'development' ? err.stack : undefined;
    }

    res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(
        404,
        `Cannot ${req.method} ${req.originalUrl}`,
        { path: req.originalUrl },
    );
    next(error);
};

/**
 * Validation error helper
 */
const handleValidationError = (validation) => {
    if (validation.error) {
        throw new AppError(400, 'Validation failed', {
            validationErrors: validation.error.details.map(d => ({
                field: d.context.key,
                message: d.message,
            })),
        });
    }
    return validation.value;
};

/**
 * Database error helper
 */
const handleDatabaseError = (error, context = {}) => {
    logError(error, { type: 'database', ...context });

    if (error.code === 'PERMISSION_DENIED') {
        throw new AppError(403, 'Database access denied');
    }
    if (error.code === 'NOT_FOUND') {
        throw new AppError(404, 'Resource not found');
    }

    throw new AppError(500, 'Database error', { original: error.message });
};

/**
 * API call error helper
 */
const handleApiError = (error, serviceName, context = {}) => {
    logError(error, {
        type: 'api_error',
        service: serviceName,
        ...context
    });

    if (error.response?.status === 401) {
        throw new AppError(503, `${serviceName} authentication failed`);
    }
    if (error.response?.status === 429) {
        throw new AppError(429, `${serviceName} rate limit exceeded`, {
            retryAfter: error.response.headers['retry-after'],
        });
    }

    throw new AppError(502, `${serviceName} error`, { status: error.response?.status });
};

module.exports = {
    AppError,
    asyncHandler,
    errorHandlingMiddleware,
    notFoundHandler,
    handleValidationError,
    handleDatabaseError,
    handleApiError,
};
