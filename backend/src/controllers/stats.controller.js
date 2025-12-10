import { firebasePromise, getDb } from "../lib/firebase.js";
import { getUserTargets } from "../lib/targets.js";

const getDateStr = (d) => d.toISOString().slice(0, 10); // yyyy-MM-dd

const parseDate = (str) => {
  const [year, month, day] = str.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDate = (date) => getDateStr(date);

// Tính status: "achieved" | "over" | "under"
const getStatus = (total, target) => {
  if (!target || target <= 0) return "unknown";
  const ratio = total / target;
  if (ratio >= 0.9 && ratio <= 1.1) return "achieved"; // trong khoảng ±10%
  if (ratio > 1.1) return "over";
  return "under";
};

// Targets are provided by `getUserTargets` in ../lib/targets.js

// =================== DAILY SUMMARY ===================
// GET /stats/daily?date=YYYY-MM-DD
export const getDailyStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = user.uid || user.userId;
    const { date } = req.query;

    const targetDate = date || getDateStr(new Date());

    await firebasePromise;
    // 1. Target từ healthProfiles (standardized helper)
    const { targetCalories, targetWaterMlPerDay } = await getUserTargets(userId);
    const targetWaterMl = targetWaterMlPerDay;

    // 2. Tổng calories từ meals trong ngày
    const db = getDb();
    const mealSnap = await db
      .collection("meals")
      .where("userId", "==", userId)
      .where("date", "==", targetDate)
      .get();

    let totalCalories = 0;
    const meals = [];

    mealSnap.forEach((doc) => {
      const data = doc.data();
      totalCalories += data.totalCalories || 0;
      meals.push({
        id: doc.id,
        ...data,
      });
    });

    // 3. Tổng nước uống từ waterLogs
    const waterSnap = await db
      .collection("waterLogs")
      .where("userId", "==", userId)
      .where("date", "==", targetDate)
      .get();

    let totalWaterMl = 0;
    const waterLogs = [];

    waterSnap.forEach((doc) => {
      const data = doc.data();
      totalWaterMl += data.amountMl || 0;
      waterLogs.push({
        id: doc.id,
        ...data,
      });
    });

    // 4. Status
    const status = getStatus(totalCalories, targetCalories);

    return res.status(200).json({
      date: targetDate,
      total_calories: totalCalories,
      target_calories: targetCalories,
      total_water_ml: totalWaterMl,
      target_water_ml: targetWaterMl,
      status,      // "achieved" | "over" | "under" | "unknown"
      meals,       // optional: danh sách các bữa
      water_logs: waterLogs, // optional: log nước
    });
  } catch (error) {
    console.error("Error in getDailyStats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =================== WEEKLY SUMMARY ===================
// GET /stats/weekly?start=YYYY-MM-DD
export const getWeeklyStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = user.uid || user.userId;
    const { start } = req.query;

    const startDate = start ? parseDate(start) : new Date();
    // chuẩn hóa về đầu tuần nếu muốn, tạm dùng đúng ngày start user truyền
    const startStr = getDateStr(startDate);
    const endDate = addDays(startDate, 6); // 7 ngày: start -> start+6
    const endStr = getDateStr(endDate);

    const { targetCalories, targetWaterMlPerDay } = await getUserTargets(userId);
    const targetWaterMl = targetWaterMlPerDay;

    await firebasePromise;
    const db = getDb();

    // 1. Lấy meals trong khoảng tuần
    const mealsSnap = await db
      .collection("meals")
      .where("userId", "==", userId)
      .where("date", ">=", startStr)
      .where("date", "<=", endStr)
      .get();

    const caloriesByDate = {};
    mealsSnap.forEach((doc) => {
      const data = doc.data();
      const d = data.date;
      if (!caloriesByDate[d]) caloriesByDate[d] = 0;
      caloriesByDate[d] += data.totalCalories || 0;
    });

    // 2. Lấy waterLogs trong khoảng tuần
    const waterSnap = await db
      .collection("waterLogs")
      .where("userId", "==", userId)
      .where("date", ">=", startStr)
      .where("date", "<=", endStr)
      .get();

    const waterByDate = {};
    waterSnap.forEach((doc) => {
      const data = doc.data();
      const d = data.date;
      if (!waterByDate[d]) waterByDate[d] = 0;
      waterByDate[d] += data.amountMl || 0;
    });

    // 3. Build mảng 7 ngày liên tiếp
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(startDate, i);
      const dateStr = formatDate(d);
      const totalCalories = caloriesByDate[dateStr] || 0;
      const totalWaterMl = waterByDate[dateStr] || 0;

      days.push({
        date: dateStr,
        total_calories: totalCalories,
        target_calories: targetCalories,
        total_water_ml: totalWaterMl,
        target_water_ml: targetWaterMl,
        status: getStatus(totalCalories, targetCalories),
      });
    }

    return res.status(200).json({
      start_date: startStr,
      end_date: endStr,
      days,
    });
  } catch (error) {
    console.error("Error in getWeeklyStats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// =================== MONTHLY SUMMARY ===================
// GET /stats/monthly?month=YYYY-MM
export const getMonthlyStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = user.uid || user.userId;
    const { month } = req.query; // "YYYY-MM"

    let year, monthIndex;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      year = y;
      monthIndex = m - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      monthIndex = now.getMonth();
    }

    const startDate = new Date(year, monthIndex, 1);
    const nextMonth = new Date(year, monthIndex + 1, 1);

    const startStr = getDateStr(startDate);
    const nextMonthStr = getDateStr(nextMonth); // dùng cho "< nextMonthStr"

    const { targetCalories, targetWaterMlPerDay } = await getUserTargets(userId);
    const targetWaterMl = targetWaterMlPerDay;

    await firebasePromise;
    const db = getDb();

    // 1. Meals trong tháng
    const mealsSnap = await db
      .collection("meals")
      .where("userId", "==", userId)
      .where("date", ">=", startStr)
      .where("date", "<", nextMonthStr) // < đầu tháng sau
      .get();

    const caloriesByDate = {};
    mealsSnap.forEach((doc) => {
      const data = doc.data();
      const d = data.date;
      if (!caloriesByDate[d]) caloriesByDate[d] = 0;
      caloriesByDate[d] += data.totalCalories || 0;
    });

    // 2. WaterLogs trong tháng
    const waterSnap = await db
      .collection("waterLogs")
      .where("userId", "==", userId)
      .where("date", ">=", startStr)
      .where("date", "<", nextMonthStr)
      .get();

    const waterByDate = {};
    waterSnap.forEach((doc) => {
      const data = doc.data();
      const d = data.date;
      if (!waterByDate[d]) waterByDate[d] = 0;
      waterByDate[d] += data.amountMl || 0;
    });

    // 3. Build mảng tất cả các ngày trong tháng
    const days = [];
    const cur = new Date(startDate);
    while (cur < nextMonth) {
      const dateStr = getDateStr(cur);
      const totalCalories = caloriesByDate[dateStr] || 0;
      const totalWaterMl = waterByDate[dateStr] || 0;

      days.push({
        date: dateStr,
        total_calories: totalCalories,
        target_calories: targetCalories,
        total_water_ml: totalWaterMl,
        target_water_ml: targetWaterMl,
        status: getStatus(totalCalories, targetCalories),
      });

      cur.setDate(cur.getDate() + 1);
    }

    return res.status(200).json({
      month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      days,
    });
  } catch (error) {
    console.error("Error in getMonthlyStats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
