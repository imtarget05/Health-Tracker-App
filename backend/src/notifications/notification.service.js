import { NotificationTemplates } from "./notification.templates.js";
import { firebasePromise, getDb, getApp } from "../lib/firebase.js";

// admin will be retrieved after firebase init
let admin;

// Quiet hours: 23:00 - 06:00
const DEFAULT_QUIET_HOURS = {
    startHour: 23,
    endHour: 6,
};

// Helper: thay {{placeholder}} bằng dữ liệu
export const renderTemplate = (template, variables = {}) => {
    if (!template) return { title: "", body: "" };

    const replace = (text) =>
        text.replace(/{{(.*?)}}/g, (_, key) => {
            const trimmedKey = key.trim();
            const value = variables[trimmedKey];
            return value !== undefined && value !== null ? String(value) : "";
        });

    return {
        title: replace(template.title || ""),
        body: replace(template.body || ""),
    };
};

export const isInQuietHours = (date = new Date(), quiet = DEFAULT_QUIET_HOURS) => {
    const hour = date.getHours();
    const { startHour, endHour } = quiet;
    // Quiet: [startHour, 24) U [0, endHour)
    if (startHour < endHour) {
        return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
};

// Lấy tất cả FCM token của user
const getUserDeviceTokens = async (userId) => {
    await firebasePromise;
    const db = getDb();

    const snap = await db
        .collection("deviceTokens")
        .where("userId", "==", userId)
        .where("isActive", "==", true)
        .get();

    const tokens = [];
    snap.forEach((doc) => {
        const data = doc.data();
        if (data.token) tokens.push(data.token);
    });

    return tokens;
};

// Gửi push tới một user
export const sendPushToUser = async ({
    userId,
    type,
    variables = {},
    data = {},
    respectQuietHours = true,
}) => {
    const now = new Date();
    if (respectQuietHours && isInQuietHours(now)) {
        console.log(
            `[Notification] Skip due to quiet hours for user ${userId}, type=${type}`
        );
        return;
    }

    const template = NotificationTemplates[type];
    if (!template) {
        console.warn(`[Notification] Missing template for type=${type}`);
        return;
    }

    const { title, body } = renderTemplate(template, variables);
    const tokens = await getUserDeviceTokens(userId);

    if (!tokens.length) {
        console.log(`[Notification] No active tokens for user ${userId}`);
        return;
    }

    const payload = {
        notification: {
            title,
            body,
        },
        data: {
            type,
            ...Object.entries(data).reduce((acc, [k, v]) => {
                acc[k] = String(v);
                return acc;
            }, {}),
        },
    };

    // ensure admin SDK initialized
    try {
        await firebasePromise;
        admin = getApp() || (await import("firebase-admin")).default;
    } catch (e) {
        console.error("[Notification] Firebase not initialized, cannot send push", e);
        return;
    }

    const messaging = admin.messaging();

    const response = await messaging.sendEachForMulticast({
        tokens,
        ...payload,
    });

    console.log(
        `[Notification] Sent type=${type} to user=${userId}, success=${response.successCount}, failed=${response.failureCount}`
    );

    // Optional: lưu log
    try {
        const db = getDb();
        await db.collection("notifications").add({
            userId,
            type,
            title,
            body,
            data,
            sentAt: now.toISOString(),
            read: false,
        });
    } catch (e) {
        console.warn('[Notification] Cannot write notification log to DB', e.message || e);
    }
};
