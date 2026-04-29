#!/usr/bin/env node
import { firebasePromise, getDb } from "../src/lib/firebase.js";
import dotenv from "dotenv";

// Load environment variables from .env.test if using emulator
if (process.env.USE_FIREBASE_EMULATOR === "1") {
  dotenv.config({ path: './.env.test' });
} else {
  dotenv.config();
}

const run = async () => {
  // Safety: detect emulator vs real project. Require explicit confirmation to seed real project.
  const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST || process.env.USE_FIREBASE_EMULATOR === "1";
  // If user requested emulator but didn't set host, default to localhost:8080
  if (process.env.USE_FIREBASE_EMULATOR === "1" && !process.env.FIRESTORE_EMULATOR_HOST) {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8081";
  }
  if (!isEmulator && process.env.CONFIRM_SEED !== "1") {
    console.warn("\n⚠️  Seed script will write to the configured Firebase project (not emulator).");
    console.warn("To proceed, re-run with CONFIRM_SEED=1 in your environment, or use the emulator.");
    console.warn("Example: CONFIRM_SEED=1 node scripts/seed.js\n");
    process.exit(1);
  }
  console.log(isEmulator ? "Seeding into Firebase Emulator" : "Seeding into configured Firebase project (confirmed)");
  try {
    await firebasePromise;
    const db = getDb();

    const uid = "seed-test-user-1";

    // 1) users
    await db.collection("users").doc(uid).set(
      {
        uid,
        email: "seed@example.com",
        fullName: "Seed User",
        profilePic: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // 2) healthProfiles
    const hpRef = db.collection("healthProfiles").doc();
    await hpRef.set({
      userId: uid,
      age: 30,
      gender: "male",
      heightCm: 175,
      weightKg: 70,
      activityLevel: "light",
      goal: "maintain",
      targetCaloriesPerDay: 2300,
      targetWaterMlPerDay: 2100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 3) deviceTokens
    await db.collection("deviceTokens").add({
      userId: uid,
      token: "fake-token-for-local-test",
      platform: "web",
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    // 4) add a meal for today
    const dateStr = new Date().toISOString().slice(0, 10);
    await db.collection("meals").add({
      userId: uid,
      date: dateStr,
      time: new Date().toISOString(),
      mealType: "lunch",
      totalCalories: 600,
      totalProtein: 30,
      totalFat: 20,
      totalCarbs: 70,
      createdAt: new Date().toISOString(),
    });

    // 5) add a water log
    await db.collection("waterLogs").add({
      userId: uid,
      date: dateStr,
      time: new Date().toISOString(),
      amountMl: 300,
      createdAt: new Date().toISOString(),
    });

    console.log("Seed completed");
    process.exit(0);
  } catch (e) {
    console.error("Seed failed", e);
    process.exit(1);
  }
};

run();
