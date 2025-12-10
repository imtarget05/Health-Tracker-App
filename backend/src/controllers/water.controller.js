// src/controllers/water.controller.js
import { firebasePromise, getDb } from "../lib/firebase.js";

const getDateStr = (d) => d.toISOString().slice(0, 10);   // yyyy-MM-dd
const getTimeStr = (d) => d.toISOString().slice(11, 16);  // HH:mm

// POST /water  -> log uống nước
export const createWaterLog = async (req, res) => {
    try {
        await firebasePromise;
        const db = getDb();
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        const userId = user.uid || user.userId;
        const { amountMl, date, time } = req.body;

        if (!amountMl || Number(amountMl) <= 0) {
            return res
                .status(400)
                .json({ message: "amountMl phải > 0 (ml)" });
        }

        const now = new Date();
        const logDate = date || getDateStr(now);
        const logTime = time || getTimeStr(now);
        const nowIso = now.toISOString();

        const docRef = await db.collection("waterLogs").add({
            userId,
            date: logDate,
            time: logTime,
            amountMl: Number(amountMl),
            createdAt: nowIso,
            updatedAt: nowIso,
        });

        return res.status(201).json({
            id: docRef.id,
            userId,
            date: logDate,
            time: logTime,
            amountMl: Number(amountMl),
            createdAt: nowIso,
            updatedAt: nowIso,
        });
    } catch (error) {
        console.error("Error in createWaterLog:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /water?date=YYYY-MM-DD  -> lấy log + tổng nước trong ngày
export const getWaterLogsByDate = async (req, res) => {
    try {
        await firebasePromise;
        const db = getDb();
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        const userId = user.uid || user.userId;
        const { date } = req.query;

        const targetDate = date || getDateStr(new Date());

        const snap = await db
            .collection("waterLogs")
            .where("userId", "==", userId)
            .where("date", "==", targetDate)
            .orderBy("time")
            .get();

        const logs = [];
        let totalAmountMl = 0;

        snap.forEach((doc) => {
            const data = doc.data();
            logs.push({ id: doc.id, ...data });
            totalAmountMl += data.amountMl || 0;
        });

        return res.status(200).json({
            date: targetDate,
            totalAmountMl,
            logs,
        });
    } catch (error) {
        console.error("Error in getWaterLogsByDate:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
