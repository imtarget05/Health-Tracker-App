#!/usr/bin/env node
import fetch from 'node-fetch';
import { firebasePromise, getDb } from '../src/lib/firebase.js';

// Usage: node scripts/e2e_workout_push_test.js [--deviceToken <token>]

const args = process.argv.slice(2);
let deviceToken = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--deviceToken' && args[i + 1]) { deviceToken = args[i + 1]; }
}

const SERVER = process.env.SERVER || 'http://localhost:5001';

const run = async () => {
  try {
    const unique = Date.now();
    const email = `e2e+${unique}@example.com`;
    // Use environment variable for password, never hardcode
    const password = process.env.TEST_PASSWORD || 'test-password-change-me';

    console.log('Registering user', email);
    const regRes = await fetch(`${SERVER}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'E2E Tester' }),
    });
    const regJson = await regRes.json();
    if (!regRes.ok) {
      console.error('Register failed', regJson);
      return process.exit(1);
    }

    const token = regJson.token;
    const uid = regJson.uid;
    console.log('Registered uid:', uid);

    if (deviceToken) {
      console.log('Adding device token to Firestore');
      await firebasePromise;
      const db = getDb();
      await db.collection('deviceTokens').add({ userId: uid, token: deviceToken, isActive: true, createdAt: new Date().toISOString() });
    }

    console.log('Creating workout via API...');
    const workoutRes = await fetch(`${SERVER}/workouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ type: 'cardio', duration: 30, caloriesBurned: 250 }),
    });
    const workoutJson = await workoutRes.json();
    if (!workoutRes.ok) {
      console.error('Create workout failed', workoutJson);
      return process.exit(1);
    }
    console.log('Workout created:', workoutJson.id);

    // Wait for notification service to write
    await new Promise(r => setTimeout(r, 1500));

    console.log('Querying notifications for user', uid);
    await firebasePromise;
    const db = getDb();
    const snap = await db.collection('notifications').where('userId', '==', uid).limit(20).get();
    const docs = [];
    snap.forEach(d => docs.push(d.data()));
    docs.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));

    console.log('Notifications (most recent 10):', JSON.stringify(docs.slice(0, 10), null, 2));

    console.log('E2E finished');
    process.exit(0);
  } catch (e) {
    console.error('E2E failed', e && (e.message || e));
    process.exit(1);
  }
};

run();
