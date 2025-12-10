// src/controllers/health.controller.js
import { firebasePromise, getDb } from "../lib/firebase.js";
import { getUserTargets } from "../lib/targets.js";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_CALORIE_RATIO = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

const getDateStr = (d) => d.toISOString().slice(0, 10); // yyyy-MM-dd

// ---- Helpers: BMR + TDEE + target calories ----

// Mifflin-St Jeor
const computeBmr = ({ age, gender, heightCm, weightKg }) => {
  if (!age || !gender || !heightCm || !weightKg) return null;

  if (gender === "female") {
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  // default male
  return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
};

const computeTargetCalories = ({
  age,
  gender,
  heightCm,
  weightKg,
  activityLevel,
  goal,
}) => {
  const bmr = computeBmr({ age, gender, heightCm, weightKg });
  if (!bmr) return null;

  const factor = ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS["sedentary"];
  const tdee = bmr * factor;

  let target = tdee;
  switch (goal) {
    case "lose":
      target = tdee - 500;  // giảm cân ~ -500 kcal/ngày
      break;
    case "gain":
      target = tdee + 300;  // tăng cân nhẹ ~ +300 kcal/ngày
      break;
    case "maintain":
    default:
      target = tdee;
      break;
  }

  return Math.round(target);
};

const computeTargetWater = ({ weightKg }) => {
  if (!weightKg) return null;
  // ví dụ: 30ml/kg
  return Math.round(weightKg * 30);
};

// ================== HEALTH PROFILE ==================

// GET /health/profile
export const getHealthProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = user.uid || user.userId;

    await firebasePromise;
    const db = getDb();
    const snap = await db
      .collection("healthProfiles")
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(200).json({ profile: null });
    }

    const doc = snap.docs[0];
    return res.status(200).json({ id: doc.id, ...doc.data() });
  } catch (error) {
    console.error("Error in getHealthProfile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// PUT /health/profile
export const upsertHealthProfile = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = user.uid || user.userId;

    const {
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      // optional override
      targetWaterMlPerDay,
    } = req.body;

    if (!age || !gender || !heightCm || !weightKg || !activityLevel || !goal) {
      return res.status(400).json({
        message:
          "age, gender, heightCm, weightKg, activityLevel, goal đều là bắt buộc",
      });
    }

    const targetCaloriesPerDay = computeTargetCalories({
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
    });

    if (!targetCaloriesPerDay) {
      return res.status(400).json({
        message: "Không tính được target_calories_per_day, kiểm tra lại input",
      });
    }

    const defaultWater = computeTargetWater({ weightKg });
    const finalTargetWater =
      typeof targetWaterMlPerDay === "number"
        ? targetWaterMlPerDay
        : defaultWater;

    const nowIso = new Date().toISOString();

    // tìm profile cũ (nếu có)
    await firebasePromise;
    const db = getDb();
    const snap = await db
      .collection("healthProfiles")
      .where("userId", "==", userId)
      .limit(1)
      .get();

    let docRef;
    const data = {
      userId,
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      targetCaloriesPerDay,
      targetWaterMlPerDay: finalTargetWater,
      updatedAt: nowIso,
    };

    if (snap.empty) {
      docRef = db.collection("healthProfiles").doc();
      data.createdAt = nowIso;
      await docRef.set(data);
    } else {
      docRef = snap.docs[0].ref;
      await docRef.update(data);
    }

    return res.status(200).json({
      id: docRef.id,
      ...data,
    });
  } catch (error) {
    console.error("Error in upsertHealthProfile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ================== DAILY STATS & MEAL SUGGESTION ==================

// GET /health/stats/daily?date=YYYY-MM-DD
export const getDailyStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = user.uid || user.userId;
    const { date } = req.query;
    const targetDate = date || getDateStr(new Date());

    // 1. lấy healthProfile
    const profileSnap = await db
      .collection("healthProfiles")
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (profileSnap.empty) {
      return res.status(400).json({
        message:
          "Chưa có health profile. Hãy cấu hình /health/profile trước.",
      });
    }

    const profileDoc = profileSnap.docs[0];
    const profile = profileDoc.data();

    // Tính lại targetCalories từ profile (đảm bảo luôn sync với BMR/TDEE)
    const recomputedTarget = computeTargetCalories(profile);
    const targetCaloriesPerDay =
      recomputedTarget || profile.targetCaloriesPerDay;

    const targetWaterMlPerDay =
      profile.targetWaterMlPerDay ||
      computeTargetWater({ weightKg: profile.weightKg });

    // 2. Tính consumed_calories_so_far từ collection meals
    const mealSnap = await db
      .collection("meals")
      .where("userId", "==", userId)
      .where("date", "==", targetDate)
      .get();

    let consumedCalories = 0;
    const mealTypesEaten = new Set();

    mealSnap.forEach((doc) => {
      const data = doc.data();
      consumedCalories += data.totalCalories || 0;
      if (data.mealType) {
        mealTypesEaten.add(data.mealType);
      }
    });

    const remainingCalories = Math.max(
      (targetCaloriesPerDay || 0) - consumedCalories,
      0
    );

    // 3. Tính nước đã uống trong ngày (từ waterLogs)
    const waterSnap = await db
      .collection("waterLogs")
      .where("userId", "==", userId)
      .where("date", "==", targetDate)
      .get();

    let totalWaterMl = 0;
    waterSnap.forEach((doc) => {
      const data = doc.data();
      totalWaterMl += data.amountMl || 0;
    });

    const remainingWaterMl = Math.max(
      (targetWaterMlPerDay || 0) - totalWaterMl,
      0
    );

    // 4. Gợi ý calories cho các buổi còn lại
    const remainingMealTypes = MEAL_TYPES.filter(
      (type) => !mealTypesEaten.has(type)
    );

    let suggestions = [];

    if (remainingMealTypes.length > 0 && remainingCalories > 0) {
      const totalRatio = remainingMealTypes.reduce(
        (sum, type) => sum + (MEAL_CALORIE_RATIO[type] || 0),
        0
      );

      suggestions = remainingMealTypes.map((type) => {
        const ratio = (MEAL_CALORIE_RATIO[type] || 0) / (totalRatio || 1);
        const suggestedCalories = Math.round(remainingCalories * ratio);

        return {
          mealType: type,
          ratio: MEAL_CALORIE_RATIO[type] || 0,
          suggestedCalories,
        };
      });
    }

    return res.status(200).json({
      date: targetDate,
      profile: {
        age: profile.age,
        gender: profile.gender,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
      },
      calories: {
        targetCaloriesPerDay,
        consumedCalories,
        remainingCalories,
        suggestionsByMeal: suggestions, // 👈 gợi ý cho các buổi còn lại
      },
      water: {
        targetWaterMlPerDay,
        totalWaterMl,
        remainingWaterMl,
      },
    });
  } catch (error) {
    console.error("Error in getDailyStats:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
