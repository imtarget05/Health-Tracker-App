// src/controllers/upload.controller.js
import fs from "fs/promises";
import { firebasePromise, getDb, getBucket } from "../lib/firebase.js";
import { AI_SERVICE_URL } from "../config/env.js";
import {
    handleAiProcessingSuccess,
    handleAiProcessingFailure,
} from "../notifications/notification.logic.js";

const getPublicUrl = (bucket, filePath) =>
    `https://storage.googleapis.com/${bucket.name}/${filePath}`;

export const uploadFileController = async (req, res) => {
    let localPath;
    try {
        await firebasePromise;
        const db = getDb();
        const bucket = getBucket();
        if (!req.file) {
            return res.status(400).json({ message: "File is required (field: file)" });
        }

        const user = req.user || null;
        const userId = user?.uid || user?.userId || null;

        localPath = req.file.path;
        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype;

        // 1. Upload ảnh lên Firebase Storage
        const fileNameOnBucket = `food-images/${Date.now()}-${originalName}`;
        await bucket.upload(localPath, {
            destination: fileNameOnBucket,
            metadata: { contentType: mimeType },
        });

        const imageUrl = getPublicUrl(bucket, fileNameOnBucket);

        // 2. Gọi AI service
        const fileBuffer = await fs.readFile(localPath);

        const aiResponse = await fetch(`${AI_SERVICE_URL}/predict`, {
            method: "POST",
            headers: {
                "Content-Type": "application/octet-stream",
            },
            body: fileBuffer,
        });

        if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error("AI service error:", errorText);

            // 🔔 Gửi notification thất bại AI (nếu có user)
            if (userId) {
                await handleAiProcessingFailure({ userId });
            }

            return res.status(502).json({
                message: "AI service error",
                raw: errorText,
            });
        }

        const aiData = await aiResponse.json();

        if (!aiData.success || !Array.isArray(aiData.detections) || aiData.detections.length === 0) {
            if (userId) {
                await handleAiProcessingFailure({ userId });
            }

            return res.status(400).json({
                message: "No food detected in image",
            });
        }

        const detections = aiData.detections || [];
        const totalNutrition = aiData.total_nutrition || null;
        const itemsCount = aiData.items_count ?? detections.length;
        const imageDimensions = aiData.image_dimensions || null;

        // Chọn detection chính (món có nhiều calories nhất)
        let mainDetection = null;
        if (detections.length > 0) {
            mainDetection = detections.reduce((max, cur) => {
                const curCal = cur?.nutrition?.calories ?? 0;
                const maxCal = max?.nutrition?.calories ?? 0;
                return curCal > maxCal ? cur : max;
            });
        }

        const now = new Date().toISOString();

        const logData = {
            userId,
            imagePath: fileNameOnBucket,
            imageUrl,
            detections,
            totalNutrition,
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

        const docRef = await db.collection("foodDetections").add(logData);

        // 🔔 Gửi notification thành công AI (kèm deep link)
        if (userId && mainDetection) {
            const deepLinkUrl = `healthytracker://detection/${docRef.id}`; // tuỳ mobile định nghĩa

            await handleAiProcessingSuccess({
                userId,
                mealType: "bữa ăn", // hoặc truyền chính xác hơn từ FE
                foodName: mainDetection.food,
                calories: mainDetection.nutrition?.calories ?? 0,
                deepLinkUrl,
            });
        }

        // Xoá file tạm
        try {
            await fs.unlink(localPath);
        } catch (e) {
            console.warn("Cannot remove temp file:", localPath, e.message);
        }

        return res.status(200).json({
            id: docRef.id,
            imageUrl,
            itemsCount,
            detections,
            totalNutrition,
            mainFood: logData.mainFood,
            createdAt: now,
        });
    } catch (error) {
        console.error("Error in uploadFileController:", error);

        if (localPath) {
            try {
                await fs.unlink(localPath);
            } catch (e) {
                console.warn("Cannot remove temp file:", localPath, e.message);
            }
        }

        return res.status(500).json({
            message: "Internal server error",
        });
    }
};
