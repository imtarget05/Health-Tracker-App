import fs from "fs/promises";
import path from "path";

import { db, bucket } from "../lib/firebase.js";
import { AI_SERVICE_URL } from "../config/env.js";

const getPublicUrl = (bucket, filePath) =>
    `https://storage.googleapis.com/${bucket.name}/${filePath}`;

export const uploadFileController = async (req, res) => {
    try {
        // 1. Kiểm tra file + user
        if (!req.file) {
            return res.status(400).json({ message: "File is required (field: file)" });
        }

        const user = req.user || null; // protectRoute gắn sẵn
        const userId = user?.uid || user?.userId || null;

        const localPath = req.file.path;
        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype;

        // 2. Upload lên Firebase Storage
        const fileNameOnBucket = `food-images/${Date.now()}-${originalName}`;
        await bucket.upload(localPath, {
            destination: fileNameOnBucket,
            metadata: { contentType: mimeType },
        });

        const imageUrl = getPublicUrl(bucket, fileNameOnBucket);

        // 3. Gọi AI service -> nhận JSON giống mẫu em gửi
        const fileBuffer = await fs.readFile(localPath);

        const aiResponse = await fetch(`${AI_SERVICE_URL}/predict`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream", // nếu bên AI dùng form-data thì đổi chỗ này
            },
            body: fileBuffer,
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error("AI service error:", errorText);
            return res.status(502).json({
                message: "AI service error",
                raw: errorText,
            });
        }

        const aiData = await aiResponse.json();
        // aiData = JSON giống em gửi (success, detections, total_nutrition, ...)

        if (!aiData.success) {
            return res.status(400).json({
                message: "AI detection failed",
            });
        }

        const detections = aiData.detections || [];
        const totalNutrition = aiData.total_nutrition || null;
        const itemsCount = aiData.items_count ?? detections.length;
        const imageDimensions = aiData.image_dimensions || null;

        // 4. (Optional) Nếu muốn chọn 1 món chính (ví dụ món có calories lớn nhất)
        let mainDetection = null;
        if (detections.length > 0) {
            mainDetection = detections.reduce((max, cur) => {
                const curCal = cur?.nutrition?.calories ?? 0;
                const maxCal = max?.nutrition?.calories ?? 0;
                return curCal > maxCal ? cur : max;
            });
        }

        const now = new Date().toISOString();

        // 5. Lưu log vào Firestore
        const docData = {
            userId,
            imagePath: fileNameOnBucket,
            imageUrl,
            detections,        // lưu nguyên array
            totalNutrition,    // tổng calories, protein, fat, carbs, ...
            itemsCount,
            imageDimensions,
            mainFood: mainDetection
                ? {
                    food: mainDetection.food,
                    portion_g: mainDetection.portion_g,
                    nutrition: mainDetection.nutrition,
                    confidence: mainDetection.confidence,
                }
                : null,
            createdAt: now,
        };

        const docRef = await db.collection("foodDetections").add(docData);

        // 6. Xoá file tạm
        try {
            await fs.unlink(localPath);
        } catch (e) {
            console.warn("Cannot remove temp file:", localPath, e.message);
        }

        // 7. Trả về JSON cho Flutter
        return res.status(200).json({
            id: docRef.id,
            imageUrl,
            itemsCount,
            detections,
            totalNutrition,
            mainFood: docData.mainFood,
            createdAt: now,
        });
    } catch (error) {
        console.error("Error in uploadFileController:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
