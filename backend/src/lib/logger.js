const winston = require('winston');
const path = require('path');

// Custom JSON format for structured logging
const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

// Human-readable format for console
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaString = '';
        if (Object.keys(meta).length > 0) {
            metaString = JSON.stringify(meta, null, 2);
        }
        return `${timestamp} [${level}]: ${message} ${metaString}`;
    }),
);

// Determine log level from environment
const logLevel = process.env.LOG_LEVEL || (
    process.env.NODE_ENV === 'production' ? 'info' : 'debug'
);

/**
 * Create logger instance with multiple transports
 */
const createLogger = (label) => {
    const transports = [];

    // Console transport (always included)
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: logLevel,
        }),
    );

    // File transports (file system logging)
    if (process.env.NODE_ENV !== 'test') {
        // Error log file
        transports.push(
            new winston.transports.File({
                filename: path.join(__dirname, '../logs/error.log'),
                level: 'error',
                format: jsonFormat,
                maxsize: 5242880, // 5MB
                maxFiles: 5,
            }),
        );

        // Combined log file
        transports.push(
            new winston.transports.File({
                filename: path.join(__dirname, '../logs/combined.log'),
                format: jsonFormat,
                maxsize: 5242880, // 5MB
                maxFiles: 10,
            }),
        );
    }

    return winston.createLogger({
        level: logLevel,
        format: jsonFormat,
        defaultMeta: { service: label, timestamp: new Date().toISOString() },
        transports,
        exceptionHandlers: [
            new winston.transports.File({
                filename: path.join(__dirname, '../logs/exceptions.log'),
                format: jsonFormat,
            }),
        ],
    });
};

/**
 * Create child loggers for different modules
 */
module.exports = {
    createLogger,

    // Pre-configured loggers for common modules
    authLogger: createLogger('auth'),
    waterLogger: createLogger('water'),
    mealLogger: createLogger('meal'),
    workoutLogger: createLogger('workout'),
    uploadLogger: createLogger('upload'),
    aiLogger: createLogger('ai'),
    authMiddlewareLogger: createLogger('auth-middleware'),
    errorLogger: createLogger('error'),
    requestLogger: createLogger('request'),

    /**
     * Log HTTP request details
     */
    logRequest: (req, res, duration) => {
        module.exports.requestLogger.info('HTTP Request', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userId: req.user?.userId || 'anonymous',
            ip: req.ip,
            userAgent: req.get('user-agent'),
        });
    },

    /**
     * Log authentication event
     */
    logAuth: (event, userId, details = {}) => {
        module.exports.authLogger.info(`Auth: ${event}`, {
            userId,
            timestamp: new Date().toISOString(),
            ...details,
        });
    },

    /**
     * Log error with context
     */
    logError: (error, context = {}) => {
        module.exports.errorLogger.error('Error occurred', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            ...context,
        });
    },

    /**
     * Log database operation
     */
    logDb: (operation, collection, duration, success = true) => {
        const logger = createLogger('database');
        const level = success ? 'debug' : 'warn';
        logger[level](`DB: ${operation}`, {
            collection,
            duration: `${duration}ms`,
            success,
        });
    },

    /**
     * Log API call to external service
     */
    logApiCall: (service, endpoint, statusCode, duration) => {
        const logger = createLogger('api-client');
        const level = statusCode >= 400 ? 'warn' : 'debug';
        logger[level](`API Call: ${service}`, {
            endpoint,
            statusCode,
            duration: `${duration}ms`,
        });
    },
};
