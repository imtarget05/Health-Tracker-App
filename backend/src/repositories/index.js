const BaseRepository = require('./base.repository');

/**
 * User Repository
 */
class UserRepository extends BaseRepository {
    constructor(db) {
        super(db.collection('users'));
        this.db = db;
    }

    /**
     * Find user by email
     */
    async findByEmail(email) {
        return this.findOne({ email: email.toLowerCase() });
    }

    /**
     * Find user by ID
     */
    async findById(userId) {
        return this.findById(userId);
    }

    /**
     * Create user with profile
     */
    async createUser(userData) {
        return this.create({
            email: userData.email.toLowerCase(),
            fullName: userData.fullName,
            phone: userData.phone || null,
            profilePicture: userData.profilePicture || null,
            preferences: {
                theme: 'light',
                notifications: true,
                language: 'en',
            },
            stats: {
                totalWorkouts: 0,
                totalCaloriesBurned: 0,
                totalWaterIntake: 0,
                totalMeals: 0,
            },
            lastActive: new Date().toISOString(),
        });
    }

    /**
     * Update user profile
     */
    async updateProfile(userId, updates) {
        const allowedFields = ['fullName', 'phone', 'profilePicture', 'preferences'];
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        return this.update(userId, filteredUpdates);
    }

    /**
     * Update user stats
     */
    async updateStats(userId, stats) {
        return this.update(userId, { stats });
    }

    /**
     * Mark user as active
     */
    async updateLastActive(userId) {
        return this.update(userId, { lastActive: new Date().toISOString() });
    }

    /**
     * Get user activity stats
     */
    async getActivityStats(userId, days = 30) {
        const user = await this.findById(userId);
        return user?.stats || {};
    }
}

/**
 * Water Repository
 */
class WaterRepository extends BaseRepository {
    constructor(db) {
        super(db.collection('waterLogs'));
        this.db = db;
    }

    /**
     * Log water intake
     */
    async logWater(userId, amount, timestamp = new Date()) {
        return this.create({
            userId,
            amount,
            timestamp: timestamp.toISOString(),
            date: timestamp.toISOString().split('T')[0],
        });
    }

    /**
     * Get total water intake for a day
     */
    async getIntakeByDate(userId, date) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        const logs = await this.findAll({ userId, date: dateStr });
        return logs.reduce((sum, log) => sum + log.amount, 0);
    }

    /**
     * Get water intake for a date range
     */
    async getIntakeByRange(userId, startDate, endDate) {
        const logs = await this.findAll({ userId }, { limit: 1000 });
        return logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= startDate && logDate <= endDate;
        });
    }

    /**
     * Get daily water intake history
     */
    async getDailyHistory(userId, limit = 30) {
        const logs = await this.findAll(
            { userId },
            { limit: 1000, sortBy: 'timestamp', order: 'desc' },
        );

        // Group by date
        const dailyData = {};
        logs.forEach(log => {
            const date = log.date;
            dailyData[date] = (dailyData[date] || 0) + log.amount;
        });

        return dailyData;
    }
}

/**
 * Meal Repository
 */
class MealRepository extends BaseRepository {
    constructor(db) {
        super(db.collection('meals'));
        this.db = db;
    }

    /**
     * Log meal
     */
    async logMeal(userId, mealData) {
        return this.create({
            userId,
            ...mealData,
            date: new Date().toISOString().split('T')[0],
        });
    }

    /**
     * Get meals by date
     */
    async getMealsByDate(userId, date) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        return this.findAll({ userId, date: dateStr }, { limit: 100 });
    }

    /**
     * Get total calories for a day
     */
    async getDailyCalories(userId, date) {
        const meals = await this.getMealsByDate(userId, date);
        return meals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
    }

    /**
     * Get meal history
     */
    async getMealHistory(userId, limit = 30) {
        return this.findAll(
            { userId },
            { limit, sortBy: 'createdAt', order: 'desc' },
        );
    }

    /**
     * Get nutrition summary for a date range
     */
    async getNutritionSummary(userId, startDate, endDate) {
        const meals = await this.findAll({ userId }, { limit: 1000 });
        const filtered = meals.filter(meal => {
            const mealDate = new Date(meal.createdAt);
            return mealDate >= startDate && mealDate <= endDate;
        });

        return {
            totalCalories: filtered.reduce((sum, m) => sum + (m.calories || 0), 0),
            totalProtein: filtered.reduce((sum, m) => sum + (m.protein || 0), 0),
            totalCarbs: filtered.reduce((sum, m) => sum + (m.carbs || 0), 0),
            totalFat: filtered.reduce((sum, m) => sum + (m.fat || 0), 0),
            totalMeals: filtered.length,
            averageCaloriesPerMeal: filtered.length > 0
                ? filtered.reduce((sum, m) => sum + (m.calories || 0), 0) / filtered.length
                : 0,
        };
    }
}

/**
 * Workout Repository
 */
class WorkoutRepository extends BaseRepository {
    constructor(db) {
        super(db.collection('workouts'));
        this.db = db;
    }

    /**
     * Log workout
     */
    async logWorkout(userId, workoutData) {
        return this.create({
            userId,
            ...workoutData,
            date: new Date().toISOString().split('T')[0],
        });
    }

    /**
     * Get workouts by date
     */
    async getWorkoutsByDate(userId, date) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        return this.findAll({ userId, date: dateStr }, { limit: 100 });
    }

    /**
     * Get total calories burned in a day
     */
    async getDailyCaloriesBurned(userId, date) {
        const workouts = await this.getWorkoutsByDate(userId, date);
        return workouts.reduce((sum, w) => sum + (w.calories || 0), 0);
    }

    /**
     * Get workout streak
     */
    async getWorkoutStreak(userId) {
        const workouts = await this.findAll(
            { userId },
            { limit: 100, sortBy: 'date', order: 'desc' },
        );

        if (workouts.length === 0) return 0;

        let streak = 0;
        let currentDate = new Date(workouts[0].date);

        for (const workout of workouts) {
            const workoutDate = new Date(workout.date);
            const expectedDate = new Date(currentDate);
            expectedDate.setDate(expectedDate.getDate() - streak);

            if (workoutDate.toDateString() === expectedDate.toDateString()) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    /**
     * Get workout history
     */
    async getWorkoutHistory(userId, limit = 30) {
        return this.findAll(
            { userId },
            { limit, sortBy: 'date', order: 'desc' },
        );
    }

    /**
     * Get workout statistics
     */
    async getWorkoutStats(userId, startDate, endDate) {
        const workouts = await this.findAll({ userId }, { limit: 1000 });
        const filtered = workouts.filter(w => {
            const wDate = new Date(w.date);
            return wDate >= startDate && wDate <= endDate;
        });

        return {
            totalWorkouts: filtered.length,
            totalCaloriesBurned: filtered.reduce((sum, w) => sum + (w.calories || 0), 0),
            totalDuration: filtered.reduce((sum, w) => sum + (w.duration || 0), 0),
            averageCaloriesPerWorkout: filtered.length > 0
                ? filtered.reduce((sum, w) => sum + (w.calories || 0), 0) / filtered.length
                : 0,
            averageDurationPerWorkout: filtered.length > 0
                ? filtered.reduce((sum, w) => sum + (w.duration || 0), 0) / filtered.length
                : 0,
            workoutTypes: [...new Set(filtered.map(w => w.type))],
        };
    }
}

module.exports = {
    BaseRepository,
    UserRepository,
    WaterRepository,
    MealRepository,
    WorkoutRepository,
};
