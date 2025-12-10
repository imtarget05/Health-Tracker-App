// src/notifications/notification.logic.js
import { sendPushToUser } from "./notification.service.js";
import { NotificationType } from "./notification.templates.js";
import { firebasePromise, getDb } from "../lib/firebase.js";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

// ===== Water Reminder Logic =====

/**
 * Mode SMART:
 * Input: lastLogTime, currentIntake, dailyGoal, intervalMinutes, now
 * Trả về true/false có nên nhắc không
 */
export const shouldSendSmartWaterReminder = ({
    lastLogTime,
    currentIntake,
    dailyGoal,
    intervalMinutes,
    now = new Date(),
}) => {
    if (!dailyGoal || dailyGoal <= 0) return false;
    if (currentIntake >= dailyGoal) return false;

    if (!lastLogTime) return true; // chưa từng log -> có thể nhắc

    const last = new Date(lastLogTime);
    const diffMs = now.getTime() - last.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    return diffMinutes >= intervalMinutes;
};

/**
 * Hàm gọi khi muốn check và gửi water reminder (SMART)
 */
export const handleSmartWaterReminder = async ({
    userId,
    lastLogTime,
    currentIntake,
    dailyGoal,
    intervalMinutes = 120,
    now = new Date(),
}) => {
    const shouldSend = shouldSendSmartWaterReminder({
        lastLogTime,
        currentIntake,
        dailyGoal,
        intervalMinutes,
        now,
    });

    if (!shouldSend) return;

    const hoursSinceLast = lastLogTime
        ? Math.round(
            (now.getTime() - new Date(lastLogTime).getTime()) / (1000 * 60 * 60)
        )
        : null;

    const remaining = Math.max(dailyGoal - (currentIntake || 0), 0);
    const suggested = Math.min(remaining, 250); // gợi ý 250ml hoặc còn bao nhiêu thì bấy nhiêu

    await sendPushToUser({
        userId,
        type: NotificationType.WATER_REMINDER,
        variables: {
            hours_since_last: hoursSinceLast ?? "?",
            current_water: currentIntake ?? 0,
            target_water: dailyGoal,
            suggested_ml: suggested || 250,
        },
    });
};

// ===== Meal Reminder Logic =====

/**
 * Tạo local notification schedule (Mobile sẽ dùng).
 * Ở BE chỉ trả về mốc thời gian gợi ý: trước giờ ăn 15 phút.
 */
export const getMealReminderTimes = (userSettings) => {
    // userSettings: { breakfast: "07:00", lunch: "12:00", dinner: "19:00" }
    const result = {};
    for (const mealType of MEAL_TYPES) {
        const timeStr = userSettings?.[mealType];
        if (!timeStr) continue;

        const [h, m] = timeStr.split(":").map(Number);
        // Trừ 15 phút
        let date = new Date();
        date.setHours(h, m, 0, 0);
        date = new Date(date.getTime() - 15 * 60 * 1000);

        result[mealType] = `${String(date.getHours()).padStart(2, "0")}:${String(
            date.getMinutes()
        ).padStart(2, "0")}`;
    }
    return result;
};

/**
 * Gửi meal reminder (push) – nếu muốn dùng remote
 */
export const sendMealReminder = async ({ userId, mealType }) => {
    if (!MEAL_TYPES.includes(mealType)) return;

    await sendPushToUser({
        userId,
        type: NotificationType.MEAL_REMINDER,
        variables: {
            meal_type: mealType,
        },
    });
};

// ===== Calorie Warning (Real-time) =====

/**
 * Trả về:
 * - "over" nếu current > 110% target
 * - "under" nếu giờ > 20:00 và current < 50% target
 * - null nếu không cảnh báo
 */
export const getCalorieWarningStatus = ({
    currentCalories,
    targetCalories,
    now = new Date(),
}) => {
    if (!targetCalories || targetCalories <= 0) return null;

    const ratio = currentCalories / targetCalories;
    const hour = now.getHours();

    if (ratio > 1.1) return "over";
    if (hour >= 20 && ratio < 0.5) return "under";

    return null;
};

/**
 * Gọi sau khi user log bữa ăn (real-time)
 */
export const handleCalorieWarningAfterMealLogged = async ({
    userId,
    currentCalories,
    targetCalories,
    now = new Date(),
}) => {
    const status = getCalorieWarningStatus({ currentCalories, targetCalories, now });

    if (status === "over") {
        const percent = Math.round((currentCalories / targetCalories) * 100);

        await sendPushToUser({
            userId,
            type: NotificationType.CALORIE_OVER,
            variables: {
                current_calories: Math.round(currentCalories),
                target_calories: Math.round(targetCalories),
                percent,
            },
        });
    } else if (status === "under") {
        const percent = Math.round((currentCalories / targetCalories) * 100);
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(
            now.getMinutes()
        ).padStart(2, "0")}`;

        await sendPushToUser({
            userId,
            type: NotificationType.CALORIE_UNDER,
            variables: {
                current_calories: Math.round(currentCalories),
                target_calories: Math.round(targetCalories),
                percent,
                time: timeStr,
            },
        });
    }
};

// ===== AI Processing Feedback =====

/**
 * Gọi khi AI xử lý ảnh xong (thành công)
 */
export const handleAiProcessingSuccess = async ({
    userId,
    mealType,
    foodName,
    calories,
    deepLinkUrl,
}) => {
    await sendPushToUser({
        userId,
        type: NotificationType.AI_PROCESSING_SUCCESS,
        variables: {
            meal_type: mealType || "bữa ăn",
            food_name: foodName || "món ăn",
            calories: Math.round(calories || 0),
        },
        data: {
            deep_link: deepLinkUrl || "",
        },
    });
};

/**
 * Gọi khi AI lỗi (không nhận diện được)
 */
export const handleAiProcessingFailure = async ({ userId }) => {
    await sendPushToUser({
        userId,
        type: NotificationType.AI_PROCESSING_FAILURE,
        variables: {},
    });
};

// ===== Daily Summary / Gamification Logic =====

/**
 * Tạo nội dung note cho daily summary (positive / constructive)
 */
export const buildDailySummaryNote = ({
    totalCalories,
    targetCalories,
    totalWater,
    targetWater,
}) => {
    let note = "Một ngày tuyệt vời! Ngày mai tiếp tục phát huy nhé 💪";

    if (targetCalories && totalCalories > 1.1 * targetCalories) {
        note =
            "Hôm nay bạn hơi vượt calo mục tiêu. Ngày mai thử tăng vận động và ăn sạch hơn nhé.";
    } else if (targetCalories && totalCalories < 0.8 * targetCalories) {
        note =
            "Bạn ăn hơi ít so với mục tiêu. Cẩn thận ăn thiếu kéo dài sẽ ảnh hưởng sức khỏe.";
    }

    if (targetWater && totalWater < 0.7 * targetWater) {
        note += " Nhớ uống đủ nước để da đẹp và cơ thể khỏe hơn 💧";
    }

    return note;
};

/**
 * Check streak: số ngày liên tiếp user có log (meals hoặc water)
 */
export const computeStreakDays = async ({ userId, maxLookbackDays = 30 }) => {
    const today = new Date();
    let streak = 0;

    for (let i = 0; i < maxLookbackDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);

        await firebasePromise;
        const db = getDb();

        const mealsSnap = await db
            .collection("meals")
            .where("userId", "==", userId)
            .where("date", "==", dateStr)
            .limit(1)
            .get();

        const waterSnap = await db
            .collection("waterLogs")
            .where("userId", "==", userId)
            .where("date", "==", dateStr)
            .limit(1)
            .get();

        const hasActivity = !mealsSnap.empty || !waterSnap.empty;
        if (hasActivity) streak += 1;
        else break;
    }

    return streak;
};

/**
 * Gửi Daily Summary
 */
export const sendDailySummaryNotification = async ({
    userId,
    date,
    totalCalories,
    targetCalories,
    totalWater,
    targetWater,
}) => {
    const summary_note = buildDailySummaryNote({
        totalCalories,
        targetCalories,
        totalWater,
        targetWater,
    });

    await sendPushToUser({
        userId,
        type: NotificationType.DAILY_SUMMARY,
        variables: {
            total_calories: Math.round(totalCalories || 0),
            target_calories: Math.round(targetCalories || 0),
            total_water: Math.round(totalWater || 0),
            target_water: Math.round(targetWater || 0),
            summary_note,
        },
        data: {
            date,
        },
    });
};

/**
 * Gửi Streak Reminder nếu đến giờ mà user chưa log hôm nay
 */
export const sendStreakReminderIfNeeded = async ({ userId, currentDate }) => {
    const dateStr = currentDate.toISOString().slice(0, 10);

    await firebasePromise;
    const db = getDb();

    const mealsSnap = await db
        .collection("meals")
        .where("userId", "==", userId)
        .where("date", "==", dateStr)
        .limit(1)
        .get();

    const waterSnap = await db
        .collection("waterLogs")
        .where("userId", "==", userId)
        .where("date", "==", dateStr)
        .limit(1)
        .get();

    const hasActivity = !mealsSnap.empty || !waterSnap.empty;
    if (hasActivity) return;

    const streakDays = await computeStreakDays({ userId });

    if (streakDays >= 3) {
        await sendPushToUser({
            userId,
            type: NotificationType.STREAK_REMINDER,
            variables: {
                streak_days: streakDays,
            },
        });
    }
};
