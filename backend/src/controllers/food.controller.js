import fs from "fs/promises";
import { db } from "../lib/firebase.js";
import { AI_SERVICE_URL } from "../config/env.js";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

export const scanFood = async (req, res) => {
  let localPath;
  try {
    const user = req.user || null;
    const userId = user?.uid || user?.userId || null;
    const { mealType } = req.body;

    // mealType không bắt buộc, nhưng nếu có thì validate
    let normalizedMealType = null;
    if (mealType && MEAL_TYPES.includes(mealType)) {
      normalizedMealType = mealType;
    }

    // 1. Kiểm tra file
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "File is required (field name: file)" });
    }

    localPath = req.file.path;

    // 2. Gọi AI service (BE ↔ AI)
    const fileBuffer = await fs.readFile(localPath);

    const aiResponse = await fetch(`${AI_SERVICE_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream", // nếu AI dùng form-data thì đổi chỗ này
      },
      body: fileBuffer,
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      console.error("AI service error:", text);
      return res.status(502).json({
        message: "AI service error",
        raw: text,
      });
    }

    const aiData = await aiResponse.json();
    // dạng:
    // {
    //   success: true,
    //   detections: [ { food, confidence, portion_g, nutrition:{...} } ],
    //   total_nutrition: {...},
    //   items_count: 1,
    //   image_dimensions: {...}
    // }

    if (!aiData.success || !Array.isArray(aiData.detections) || aiData.detections.length === 0) {
      return res.status(400).json({
        message: "No food detected in image",
      });
    }

    // Chọn detection chính (ở đây chọn detection đầu tiên
    // hoặc em có thể chọn detection có calories lớn nhất)
    const mainDetection = aiData.detections[0];

    const label = mainDetection.food;
    const confidence = mainDetection.confidence;
    const portionG = mainDetection.portion_g;
    const nutrition = mainDetection.nutrition || {};

    // 3. Tra bảng FoodItem (bảng chuẩn dinh dưỡng)
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

    // 4. Build response theo spec

    let suggestedServing;
    let calories;

    if (foodItem) {
      // nếu đã có trong bảng chuẩn
      suggestedServing = foodItem.servingSize || "1 serving";
      calories =
        foodItem.caloriesPerServing ??
        nutrition.calories ??
        null;
    } else {
      // chưa có trong bảng chuẩn -> fallback dùng AI
      suggestedServing =
        typeof portionG === "number"
          ? `${Math.round(portionG)}g`
          : "1 serving";

      calories = nutrition.calories ?? null;
    }

    // 5. Trả JSON về cho Flutter (Mobile ↔ BE)
    return res.status(200).json({
      label,                       // vd: "bread"
      confidence,                  // 0.92
      suggested_serving: suggestedServing, // "1 slice (30g)" hoặc "349g"
      calories,                    // 80 hoặc từ AI
      food_item_id: foodItemId,    // id trong collection foodItems (nếu có)
      meal_type: normalizedMealType,
      // bonus info cho FE nếu cần
      ai_meta: {
        items_count: aiData.items_count,
        total_nutrition: aiData.total_nutrition,
        image_dimensions: aiData.image_dimensions,
      },
    });
  } catch (error) {
    console.error("Error in scanFood:", error);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    // Xoá file tạm
    if (localPath) {
      try {
        await fs.unlink(localPath);
      } catch (e) {
        console.warn("Cannot remove temp file:", localPath, e.message);
      }
    }
  }
};
