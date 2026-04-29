// src/controllers/ai.controller.js
import { gemini, GEMINI_CHAT_MODEL } from "../config/gemini.js";
import { firebasePromise, getDb } from "../lib/firebase.js";
import { sendPushToUser } from '../notifications/notification.service.js';
import { NotificationType } from '../notifications/notification.templates.js';

// Build system prompt dựa trên user + healthProfile
const buildSystemPrompt = (user, healthProfile) => {
  const base =
    "Bạn là một chuyên gia dinh dưỡng & huấn luyện viên sức khỏe, " +
    "tư vấn bằng tiếng Việt, giải thích ngắn gọn, dễ hiểu, không phán xét.\n\n" +
    "Ngữ cảnh: ứng dụng Healthy Tracker giúp người dùng theo dõi calories, nước uống, " +
    "cân nặng và thói quen tập luyện.\n";

  let profileText = "";
  if (healthProfile) {
    profileText =
      "\nThông tin sức khỏe của user:\n" +
      `- Tuổi: ${healthProfile.age ?? "?"}\n` +
      `- Giới tính: ${healthProfile.gender ?? "?"}\n` +
      `- Chiều cao: ${healthProfile.heightCm ?? "?"} cm\n` +
      `- Cân nặng: ${healthProfile.weightKg ?? "?"} kg\n` +
      `- Mức độ vận động: ${healthProfile.activityLevel ?? "?"}\n` +
      `- Mục tiêu: ${healthProfile.goal ?? "?"}\n` +
      `- Target calories/ngày: ${healthProfile.targetCaloriesPerDay ?? "?"}\n` +
      `- Target nước/ngày (ml): ${healthProfile.targetWaterMlPerDay ?? "?"}\n`;
  }

  return (
    base +
    profileText +
    "\nQuy tắc trả lời:\n" +
    "- Luôn trả lời bằng tiếng Việt thân thiện.\n" +
    "- Gợi ý cụ thể (ví dụ: ví dụ bữa ăn, khẩu phần, bài tập), không chỉ nói lý thuyết.\n" +
    "- Nếu user hỏi ngoài chủ đề sức khỏe/dinh dưỡng/thể dục, trả lời ngắn gọn rồi kéo về chủ đề chính.\n"
  );
};

// Helper: build Gemini contents array from system prompt, history, and current message
const _buildGeminiContents = (systemPrompt, history, message) => {
  const contents = [];
  contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  if (Array.isArray(history)) {
    for (const turn of history) {
      if (!turn?.role || !turn?.content) continue;
      contents.push({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.content }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
};

// Helper: persist AI chat record and optionally send notification
const _saveChatRecord = async (db, userId, message, replyText) => {
  const now = new Date();
  const chatRecord = { userId, message, reply: replyText, model: GEMINI_CHAT_MODEL, createdAt: now, updatedAt: now };
  if (userId) {
    await db.collection('profiles').doc(userId).collection('aiChats').add(chatRecord);
  }
  await db.collection('aiChats').add(chatRecord);
  if (userId) {
    try {
      const preview = (replyText || '').slice(0, 80);
      await sendPushToUser({ userId, type: NotificationType.AI_CHAT_REPLY, variables: { preview }, data: { chatPreview: preview }, respectQuietHours: false });
    } catch (e) {
      console.warn('Failed to send AI chat notification', e && (e.message || e));
    }
  }
};

export const chatWithAiCoach = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Field 'message' is required" });
    }

    const user = req.user || null;
    let healthProfile = null;

    // Nếu có user → lấy profile để cá nhân hóa
    if (user?.uid || user?.userId) {
      const userId = user.uid || user.userId;
      await firebasePromise;
      const db = getDb();
      const snap = await db
        .collection("healthProfiles")
        .where("userId", "==", userId)
        .limit(1)
        .get();
      if (!snap.empty) {
        healthProfile = snap.docs[0].data();
      }
    }

    const systemPrompt = buildSystemPrompt(user, healthProfile);
    const contents = _buildGeminiContents(systemPrompt, history, message);

    const response = await gemini.models.generateContent({
      model: GEMINI_CHAT_MODEL,
      contents,
    });

    const replyText = response.text || "";

    // Save chat turn to Firestore for history/audit (non-fatal)
    try {
      await firebasePromise;
      const db = getDb();
      const userId = req.user?.uid || req.user?.userId || null;
      await _saveChatRecord(db, userId, message, replyText);
    } catch (err) {
      console.error('Failed to persist AI chat record:', err);
    }

    return res.status(200).json({ reply: replyText, model: GEMINI_CHAT_MODEL });
  } catch (error) {
    console.error("Error in chatWithAiCoach:", error);
    return res.status(500).json({ message: "AI chat error" });
  }
};

export const getAiChatHistory = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !(user.uid || user.userId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userId = user.uid || user.userId;
    const limit = Math.min(100, Number.parseInt(req.query.limit || '50', 10));

    await firebasePromise;
    const db = getDb();

    // If client requested summaries, return per-profile aiChatSummaries
    const returnSummaries = req.query.summary === '1' || req.query.summary === 'true';

    if (returnSummaries) {
      const profileRef = db.collection('profiles').doc(userId);
      const summariesRef = profileRef.collection('aiChatSummaries');
      const snap = await summariesRef.orderBy('updatedAt', 'desc').limit(limit).get();
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ history: docs });
    }

    // Default: return detailed aiChats (individual turns)
    const profileRef = db.collection('profiles').doc(userId);
    const chatsRef = profileRef.collection('aiChats');
    const snap = await chatsRef.orderBy('createdAt', 'desc').limit(limit).get();

    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.status(200).json({ history: docs });
  } catch (err) {
    console.error('getAiChatHistory error', err);
    return res.status(500).json({ message: 'Failed to load history' });
  }
};

// Save or update a per-conversation summary (prompt + response) under
// profiles/{userId}/aiChatSummaries with doc id equal to chatId. This is
// intended for clients to persist a single summary row per conversation and
// allow ordering by updatedAt so updated conversations move to the top.
export const saveAiChatSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !(user.uid || user.userId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { chatId, prompt, response: reply, imagesUrls } = req.body;
    if (!chatId || typeof chatId !== 'string') {
      return res.status(400).json({ message: 'Field "chatId" is required' });
    }

    const userId = user.uid || user.userId;
    await firebasePromise;
    const db = getDb();

    const now = new Date();
    const summaryDoc = {
      chatId,
      prompt: prompt || '',
      response: reply || '',
      imagesUrls: Array.isArray(imagesUrls) ? imagesUrls : [],
      updatedAt: now,
      userId,
    };

    const profileRef = db.collection('profiles').doc(userId);
    const summariesRef = profileRef.collection('aiChatSummaries');

    // Use chatId as the document id so subsequent saves overwrite and move
    // the conversation to the top when ordered by updatedAt.
    await summariesRef.doc(chatId).set(summaryDoc, { merge: true });

    // Optionally store a top-level copy for admin/debugging
    try {
      await db.collection('aiChatSummaries').doc(chatId + '_' + userId).set(summaryDoc, { merge: true });
    } catch (e) {
      // non-fatal
      console.error('Failed to write top-level summary copy:', e);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('saveAiChatSummary error', err);
    return res.status(500).json({ message: 'Failed to save summary' });
  }
};

export const deleteAiChatSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !(user.uid || user.userId)) return res.status(401).json({ message: 'Unauthorized' });

    const userId = user.uid || user.userId;
    const { chatId } = req.params;
    if (!chatId) return res.status(400).json({ message: 'chatId required' });

    await firebasePromise;
    const db = getDb();

    const profileRef = db.collection('profiles').doc(userId);
    const summariesRef = profileRef.collection('aiChatSummaries');
    await summariesRef.doc(chatId).delete().catch(err => {
      console.warn('[AI CONTROLLER] Failed to delete chat summary from profile collection:', err?.message);
    });

    // delete top-level copy if present
    try {
      await db.collection('aiChatSummaries').doc(chatId + '_' + userId).delete().catch(err => {
        console.warn('[AI CONTROLLER] Failed to delete top-level chat summary:', err?.message);
      });
    } catch (e) {
      console.error('[AI CONTROLLER] Error during summary deletion:', e);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('deleteAiChatSummary error', err);
    return res.status(500).json({ message: 'Failed to delete summary' });
  }
};
