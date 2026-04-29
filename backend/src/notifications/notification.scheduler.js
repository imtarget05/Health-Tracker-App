import cron from "node-cron";
import { firebasePromise, getDb } from "../lib/firebase.js";

// Helper: return db or null and log friendly error when Firestore is not reachable
const safeGetDb = async (context = 'unknown') => {
    try {
        await firebasePromise;
        return getDb();
    } catch (err) {
        // Friendly, actionable log for operators
        console.warn(`[Cron][${context}] Firestore unavailable: ${err && (err.message || err)}. ` +
            `Is FIRESTORE_EMULATOR_HOST set (for dev) or are credentials configured (for prod)?`);
        return null;
    }
};
import { getUserTargets } from "../lib/targets.js";
import {
    sendDailySummaryNotification,
    sendStreakReminderIfNeeded,
} from "./notification.logic.js";
import { sendPushToUser } from "./notification.service.js";
import { NotificationType } from "./notification.templates.js";

// Helper lấy profile & target
// Use central helper getUserTargets in ../lib/targets.js

// Helper lấy daily totals (calo + nước)
const getDailyTotals = async (userId, dateStr) => {
    const db = await safeGetDb('getDailyTotals');
    if (!db) throw new Error('FirestoreUnavailable');
    // meals
    const mealSnap = await db
        .collection("meals")
        .where("userId", "==", userId)
        .where("date", "==", dateStr)
        .get();

    let totalCalories = 0;
    mealSnap.forEach((doc) => {
        const data = doc.data();
        totalCalories += data.totalCalories || 0;
    });

    // water
    const waterSnap = await db
        .collection("waterLogs")
        .where("userId", "==", userId)
        .where("date", "==", dateStr)
        .get();

    let totalWater = 0;
    waterSnap.forEach((doc) => {
        const data = doc.data();
        totalWater += data.amountMl || 0;
    });

    // workouts for the date
    const workoutSnap = await db
        .collection("workouts")
        .where("userId", "==", userId)
        .where("createdAt", ">=", `${dateStr}T00:00:00.000Z`)
        .where("createdAt", "<=", `${dateStr}T23:59:59.999Z`)
        .get();

    let totalBurned = 0;
    workoutSnap.forEach((doc) => {
        const data = doc.data();
        totalBurned += data.caloriesBurned || 0;
    });

    return { totalCalories, totalWater, totalBurned };
};

// Helper: lấy tất cả userId có healthProfiles (để gửi summary)
const getAllActiveUserIds = async () => {
    const db = await safeGetDb('getAllActiveUserIds');
    if (!db) return [];
    const snap = await db.collection("healthProfiles").get();
    const ids = new Set();
    snap.forEach((doc) => {
        const data = doc.data();
        if (data.userId) ids.add(data.userId);
    });
    return Array.from(ids);
};

// Helper: lấy user inactive > X ngày
const getInactiveUserIds = async (days) => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - days);

    const db = await safeGetDb('getInactiveUserIds');
    if (!db) return [];

    const snap = await db
        .collection("users") // collection profile user
        .where("lastLoginAt", "<", cutoff.toISOString())
        .get();

    const ids = [];
    snap.forEach((doc) => {
        const data = doc.data();
        if (data.uid) ids.push(data.uid);
    });

    return ids;
};

export const startNotificationSchedulers = () => {
    // ---- Daily Summary: 21:00 mỗi ngày ----
    cron.schedule("0 21 * * *", async () => {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);

        console.log("[Cron] Running Daily Summary at 21:00 for", dateStr);
        await firebasePromise;
        const userIds = await getAllActiveUserIds();

        // Process users in chunks to limit concurrency and avoid timeouts
        const CHUNK_SIZE = 30;
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
            const chunk = userIds.slice(i, i + CHUNK_SIZE);
            await Promise.all(
                chunk.map(async (userId) => {
                    try {
                        const { targetCalories, targetWaterMlPerDay } = await getUserTargets(userId);
                        const { totalCalories, totalWater, totalBurned } = await getDailyTotals(
                            userId,
                            dateStr
                        );

                        await sendDailySummaryNotification({
                            userId,
                            date: dateStr,
                            totalCalories,
                            targetCalories,
                            totalWater,
                            targetWater: targetWaterMlPerDay,
                            totalBurned,
                        });
                    } catch (e) {
                        console.error("[Cron] DailySummary error for user", userId, e);
                    }
                })
            );
        }
    });

    // ---- Streak Reminder: 20:00 mỗi ngày ----
    cron.schedule("0 20 * * *", async () => {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        console.log("[Cron] Running Streak Reminder at 20:00 for", dateStr);

        await firebasePromise;
        const userIds = await getAllActiveUserIds();
        const CHUNK_SIZE = 50;
        for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
            const chunk = userIds.slice(i, i + CHUNK_SIZE);
            await Promise.all(
                chunk.map(async (userId) => {
                    try {
                        await sendStreakReminderIfNeeded({ userId, currentDate: now });
                    } catch (e) {
                        console.error("[Cron] StreakReminder error for user", userId, e);
                    }
                })
            );
        }
    });

    // ---- Workout Reminder: check every 5 minutes for users with workout preferences ----
    cron.schedule('*/5 * * * *', async () => {
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        console.log('[Cron] Running Workout Reminder check at', hhmm);

        const db = await safeGetDb('WorkoutReminder');
        if (!db) return; // Firestore down or not configured

        // healthProfiles expected to have workout settings under 'workout' field
        const snap = await db.collection('healthProfiles').get();
        const users = [];
        snap.forEach(doc => {
            const data = doc.data();
            if (data.userId && data.workout?.enabled && data.workout?.preferredTime) {
                users.push({ userId: data.userId, workout: data.workout });
            }
        });

        const CHUNK = 50;
        for (let i = 0; i < users.length; i += CHUNK) {
            const chunk = users.slice(i, i + CHUNK);
            await Promise.all(chunk.map(async ({ userId, workout }) => {
                try {
                    const pref = workout.preferredTime; // 'HH:MM'
                    // allow small window of 5 minutes
                    if (!pref) return;
                    const [ph, pm] = pref.split(':').map(Number);
                    const prefDate = new Date(now);
                    prefDate.setHours(ph, pm, 0, 0);
                    // check if now is strictly within [prefDate, prefDate + 5 mins)
                    const diff = now.getTime() - prefDate.getTime();
                    if (diff < 0 || diff >= 5 * 60 * 1000) return; // outside 5-minute window

                    const dateStr = now.toISOString().slice(0, 10);
                    const workoutsToday = await db.collection('workouts')
                        .where('userId', '==', userId)
                        .where('createdAt', '>=', `${dateStr}T00:00:00.000Z`)
                        .where('createdAt', '<=', `${dateStr}T23:59:59.999Z`)
                        .limit(1)
                        .get();

                    if (!workoutsToday.empty) return; // already logged

                    // send reminder (do not respect quiet hours for timely workout reminders)
                    console.log('[Cron] Sending workout reminder for user', userId, 'preferredTime=', pref);
                    await sendPushToUser({
                        userId,
                        type: NotificationType.WORKOUT_REMINDER,
                        variables: {
                            calories_burned: 0,
                            target_calories_burned: workout.targetCaloriesBurnPerSession || 200,
                        },
                        respectQuietHours: false,
                    });
                } catch (e) {
                    console.error('[Cron] WorkoutReminder error for user', userId, e && (e.message || e));
                }
            }));
        }
    });

    // ---- Re-engagement: 10:00 mỗi ngày, nếu > 3 ngày không login ----
    cron.schedule("0 10 * * *", async () => {
        console.log("[Cron] Running Re-engagement at 10:00");

        await firebasePromise;
        const inactiveUserIds = await getInactiveUserIds(3);
        const CHUNK_SIZE = 50;
        for (let i = 0; i < inactiveUserIds.length; i += CHUNK_SIZE) {
            const chunk = inactiveUserIds.slice(i, i + CHUNK_SIZE);
            await Promise.all(
                chunk.map(async (userId) => {
                    try {
                        await sendPushToUser({
                            userId,
                            type: NotificationType.RE_ENGAGEMENT,
                            variables: {
                                inactive_days: 3,
                            },
                        });
                    } catch (e) {
                        console.error("[Cron] Re-engagement error for user", userId, e);
                    }
                })
            );
        }
    });

    console.log("✅ Notification schedulers started");
};

// Store cron jobs for cleanup on shutdown
const cronJobs = [];

// add a single ESM export that starts both schedulers
export function startSchedulers() {
    // start per-user workout reminder and daily summary schedulers
    try {
        if (typeof startNotificationSchedulers === 'function') {
            startNotificationSchedulers();
            console.log('[SCHEDULER] All notification schedulers initialized successfully');
        }
        
        // Register cleanup on global shutdown
        globalThis.shutdownTasks = async () => {
            console.log('[SCHEDULER] Stopping all cron jobs...');
            // Stop all node-cron tasks
            if (cron && typeof cron.getTasks === 'function') {
                const tasks = cron.getTasks();
                for (const task of tasks) {
                    try {
                        task.stop();
                    } catch (e) {
                        console.error('[SCHEDULER] Error stopping cron job:', e);
                    }
                }
            }
            console.log('[SCHEDULER] All cron jobs stopped');
        };
    } catch (e) {
        console.error('[SCHEDULER] Failed to initialize schedulers:', e && (e.message || e));
        throw e; // Let caller handle initialization failure
    }
}

// Cleanup: delete or archive deviceTokens that have been inactive for a long time
// days: tokens with isActive==false and lastFailureAt older than `days` will be deleted
export const cleanupStaleDeviceTokens = async (days = 90) => {
    const db = await safeGetDb('cleanupStaleDeviceTokens');
    if (!db) return { removed: 0 };
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString();

    console.log(`[Cleanup] Removing deviceTokens inactive before ${cutoffIso}`);

    const snap = await db.collection('deviceTokens')
        .where('isActive', '==', false)
        .where('lastFailureAt', '<', cutoffIso)
        .get();

    if (snap.empty) {
        console.log('[Cleanup] No stale device tokens found');
        return { removed: 0 };
    }

    const batchSize = 500;
    let removed = 0;
    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
        batch.delete(doc.ref);
        ops += 1;
        removed += 1;
        if (ops >= batchSize) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }
    if (ops > 0) await batch.commit();

    // write a cleanup log for observability
    try {
        await db.collection('tokenCleanupLogs').add({
            removed,
            cutoff: cutoffIso,
            createdAt: new Date().toISOString(),
        });
    } catch (e) {
        console.warn('[Cleanup] Failed to write cleanup log', e && (e.message || e));
    }

    console.log(`[Cleanup] Removed ${removed} stale device tokens`);
    return { removed };
};

// Schedule cleanup daily at 03:00 server time
cron.schedule('0 3 * * *', async () => {
    try {
        console.log('[Cron] Running daily device token cleanup');
        await firebasePromise;
        const res = await cleanupStaleDeviceTokens(90);
        console.log('[Cron] Device token cleanup result', res);
    } catch (e) {
        console.error('[Cron] Device token cleanup failed', e && (e.message || e));
    }
});
