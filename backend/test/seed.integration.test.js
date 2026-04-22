import { firebasePromise, getDb } from "../src/lib/firebase.js";

// Requires: Firestore emulator running + seed script executed beforehand.
// Run manually: USE_FIREBASE_EMULATOR=true node backend/scripts/seed.js
describe('Seed data integration', () => {
    test('seed user exists in Firestore emulator', async () => {
        await firebasePromise;
        const db = getDb();

        const doc = await db.collection('users').doc('seed-test-user-1').get();
        expect(doc.exists).toBe(true);

        const data = doc.data();
        expect(data.uid).toBe('seed-test-user-1');
        expect(data.email).toBe('seed@example.com');
    });
});
