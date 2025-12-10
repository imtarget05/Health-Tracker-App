// src/controllers/meal.controller.js
import { firebasePromise, getDb } from "../lib/firebase.js";
import { handleCalorieWarningAfterMealLogged } from "../notifications/notification.logic.js";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

const getDateStr = (d) => d.toISOString().slice(0, 10);   // yyyy-MM-dd
const getTimeStr = (d) => d.toISOString().slice(11, 16);  // HH:mm

// Tạo bữa ăn từ log AI (foodDetections)
export const createMealFromDetection = async (req, res) => {
    try {
        await firebasePromise;
        const db = getDb();
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: "Not authenticated" });
        }

        const userId = user.uid || user.userId;
        const { detectionId, mealType, date, time } = req.body;

        if (!detectionId || !mealType) {
            return res
                .status(400)
                .json({ message: "detectionId và mealType là bắt buộc" });
        }

        if (!MEAL_TYPES.includes(mealType)) {
            return res.status(400).json({
                message: `mealType phải là một trong: ${MEAL_TYPES.join(", ")}`,
            });
        }

        // 1. Lấy log AI trong collection foodDetections
        const detectionDoc = await db
            .collection("foodDetections")
            .doc(detectionId)
            .get();

        if (!detectionDoc.exists) {
            return res.status(404).json({ message: "Detection not found" });
        }

        const detectionData = detectionDoc.data();

        // Nếu có userId trong log và khác user hiện tại => cấm xài
        if (detectionData.userId && detectionData.userId !== userId) {
            return res.status(403).json({ message: "Not allowed for this detection" });
        }

        const detections = detectionData.detections || [];
        if (!Array.isArray(detections) || detections.length === 0) {
            return res
                .status(400)
                .json({ message: "No detections found in this detection log" });
        }

        // Lấy thời gian mặc định từ createdAt của detection
        const baseDate = detectionData.createdAt
            ? new Date(detectionData.createdAt)
            : new Date();

        const mealDate = date || getDateStr(baseDate);
        const mealTime = time || getTimeStr(baseDate);

        // Chuẩn bị batch write
        const batch = db.batch();
        const mealRef = db.collection("meals").doc();
        const nowIso = new Date().toISOString();

        let totalCalories = 0;
        let totalProtein = 0;
        let totalFat = 0;
        let totalCarbs = 0;

        // 2. Duyệt từng detection => tạo mealFoods
        for (let i = 0; i < detections.length; i++) {
            const det = detections[i];
            const label = det.food;
            const portionG = det.portion_g;
            const nutritionAI = det.nutrition || {};

            // Tìm FoodItem khớp theo name
            let foodItem = null;
            let foodItemId = null;

            const foodSnap = await db
                .collection("foodItems")
                .where("name", "==", label)
                .limit(1)
                .get();

            if (!foodSnap.empty) {
                const doc = foodSnap.docs[0];
                foodItemId = doc.id;
                foodItem = doc.data();
            }

            // Tính calories / macros
            let calories = null;
            let protein = null;
            let fat = null;
            let carbs = null;

            if (foodItem && typeof portionG === "number" && foodItem.caloriesPer100g) {
                const factor = portionG / 100;

                calories = factor * foodItem.caloriesPer100g;
                protein =
                    foodItem.proteinPer100g != null
                        ? factor * foodItem.proteinPer100g
                        : nutritionAI.protein ?? null;
                fat =
                    foodItem.fatPer100g != null
                        ? factor * foodItem.fatPer100g
                        : nutritionAI.fat ?? null;
                carbs =
                    foodItem.carbsPer100g != null
                        ? factor * foodItem.carbsPer100g
                        : nutritionAI.carbs ?? null;
            } else if (nutritionAI) {
                // Fallback: dùng số từ AI
                calories = nutritionAI.calories ?? null;
                protein = nutritionAI.protein ?? null;
                fat = nutritionAI.fat ?? null;
                carbs = nutritionAI.carbs ?? null;
            }

            // Cộng dồn tổng
            totalCalories += calories || 0;
            totalProtein += protein || 0;
            totalFat += fat || 0;
            totalCarbs += carbs || 0;

            // Tạo doc mealFood
            const mealFoodRef = db.collection("mealFoods").doc();

            batch.set(mealFoodRef, {
                mealId: mealRef.id,
                userId,
                foodItemId: foodItemId || null,
                foodName: label,
                portionGrams: portionG ?? null,
                quantity: portionG ?? null,
                unit: "g",
                calories,
                protein,
                fat,
                carbs,
                sourceDetectionId: detectionId,
                sourceDetectionIndex: i,
                createdAt: nowIso,
                updatedAt: nowIso,
            });
        }

        // 3. Tạo doc Meal
        const mealDoc = {
            userId,
            date: mealDate,
            time: mealTime,
            mealType,
            totalCalories,
            totalProtein,
            totalFat,
            totalCarbs,
            sourceDetectionId: detectionId,
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        batch.set(mealRef, mealDoc);

        // 4. Commit batch
        await batch.commit();

        // 5. Sau khi lưu thành công -> tính tổng calo trong ngày & gửi cảnh báo nếu cần
        try {
            // Lấy targetCalories từ healthProfiles
            let targetCalories = null;
            const profileSnap = await db
                .collection("healthProfiles")
                .where("userId", "==", userId)
                .limit(1)
                .get();

            if (!profileSnap.empty) {
                const profile = profileSnap.docs[0].data();
                targetCalories = profile.targetCaloriesPerDay || null;
            }

            // Tính tổng calories của tất cả meals trong ngày
            const todayMealsSnap = await db
                .collection("meals")
                .where("userId", "==", userId)
                .where("date", "==", mealDate)
                .get();

            let dailyTotal = 0;
            todayMealsSnap.forEach((doc) => {
                const data = doc.data();
                dailyTotal += data.totalCalories || 0;
            });

            await handleCalorieWarningAfterMealLogged({
                userId,
                currentCalories: dailyTotal,
                targetCalories,
                now: new Date(),
            });
        } catch (notifyErr) {
            console.error("Error sending calorie warning notification:", notifyErr);
        }

        return res.status(201).json({
            id: mealRef.id,
            ...mealDoc,
        });
    } catch (error) {
        console.error("Error in createMealFromDetection:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /meals?date=YYYY-MM-DD
export const getMealsByDate = async (req, res) => {
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
            .collection("meals")
            .where("userId", "==", userId)
            .where("date", "==", targetDate)
            .orderBy("time")
            .get();

        const meals = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return res.status(200).json({ date: targetDate, meals });
    } catch (error) {
        console.error("Error in getMealsByDate:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
