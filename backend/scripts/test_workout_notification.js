import fetch from 'node-fetch';
import { firebasePromise, getDb } from '../src/lib/firebase.js';

const SERVER = process.env.SERVER || 'http://localhost:5001';

const run = async () => {
  try {
    const unique = Date.now();
    const email = `test+${unique}@example.com`;
    // Use environment variable for password, never hardcode
    const password = process.env.TEST_PASSWORD || 'test-password-change-me';

    console.log('Registering user', email);
    const regRes = await fetch(`${SERVER}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName: 'Auto Tester' }),
    });
    const regJson = await regRes.json();
    if (!regRes.ok) {
      console.error('Register failed', regJson);
      return process.exit(1);
    }

    const token = regJson.token;
    const uid = regJson.uid;
    console.log('Registered uid:', uid);

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

    // Wait a moment for notification service to write to DB
    await new Promise((r) => setTimeout(r, 800));

    console.log('Querying Firestore notifications for user', uid);
    await firebasePromise;
    const db = getDb();

    let snap;
    try {
      snap = await db.collection('notifications')
        .where('userId', '==', uid)
        .orderBy('sentAt', 'desc')
        .limit(10)
        .get();
    } catch (err) {
      // Firestore may require a composite index for where+orderBy; fallback to limited fetch + client-side sort
      console.warn('Firestore index required for where+orderBy. Falling back to limited fetch and client-side sort:', err.message || err);
      snap = await db.collection('notifications')
        .where('userId', '==', uid)
        .limit(50)
        .get();
      // convert to array and sort by sentAt desc
      const docs = [];
      snap.forEach((d) => docs.push(d.data()));
      docs.sort((a, b) => {
        const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0;
        const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0;
        return tb - ta;
      });
      if (!docs.length) {
        console.log('No notifications found for user (maybe no device tokens to send push, but service may still write).');
      } else {
        console.log('Recent notifications (client-sorted):', JSON.stringify(docs.slice(0, 10), null, 2));
      }
      process.exit(0);
    }

    if (snap.empty) {
      console.log('No notifications found for user (maybe no device tokens to send push, but service may still write).');
    } else {
      const docs = [];
      snap.forEach((d) => docs.push(d.data()));
      console.log('Recent notifications:', JSON.stringify(docs, null, 2));
    }

    process.exit(0);
  } catch (e) {
    console.error('Error in automation script', e && (e.message || e));
    process.exit(1);
  }
};

run();
