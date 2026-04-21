/**
 * API Router - Version 1
 * /api/v1/*
 */
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.route');
const waterRoutes = require('./water.route');
const mealRoutes = require('./meal.route');
const workoutRoutes = require('./workout.route');
const userRoutes = require('./user.route');
const uploadRoutes = require('./upload.route');
const aiRoutes = require('./ai.route');
const notificationRoutes = require('./notification.route');

// Mount routes under /api/v1
router.use('/auth', authRoutes);
router.use('/water', waterRoutes);
router.use('/meals', mealRoutes);
router.use('/workouts', workoutRoutes);
router.use('/users', userRoutes);
router.use('/upload', uploadRoutes);
router.use('/ai', aiRoutes);
router.use('/notifications', notificationRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
    });
});

// API info endpoint
router.get('/', (req, res) => {
    res.json({
        name: 'Health Tracker API',
        version: '1.0.0',
        description: 'Comprehensive health and fitness tracking API',
        endpoints: {
            auth: '/api/v1/auth',
            water: '/api/v1/water',
            meals: '/api/v1/meals',
            workouts: '/api/v1/workouts',
            users: '/api/v1/users',
            upload: '/api/v1/upload',
            ai: '/api/v1/ai',
            notifications: '/api/v1/notifications',
        },
    });
});

module.exports = router;
