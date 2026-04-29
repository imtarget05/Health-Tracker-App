import { firebasePromise, getDb } from "../src/lib/firebase.js";
import net from "node:net";

// Requires: Firestore emulator running + seed script executed beforehand.
// Run manually: USE_FIREBASE_EMULATOR=true node backend/scripts/seed.js
// Skipped automatically if the Firestore emulator is not reachable.

function isEmulatorReachable(host, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
        socket.connect(port, host, () => { clearTimeout(timer); socket.destroy(); resolve(true); });
        socket.on('error', () => { clearTimeout(timer); resolve(false); });
    });
}

describe('Seed data integration', () => {
    test('seed user exists in Firestore emulator', async () => {
        const emulatorHost = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8081').split(':');
        const reachable = await isEmulatorReachable(emulatorHost[0], Number.parseInt(emulatorHost[1] || '8081'));
        if (!reachable) {
            console.warn('Skipping seed test: Firestore emulator is not running. Start it with: firebase emulators:start --only firestore');
            return;
        }

        await firebasePromise;
        const db = getDb();

        const doc = await db.collection('users').doc('seed-test-user-1').get();
        expect(doc.exists).toBe(true);

        const data = doc.data();
        expect(data.uid).toBe('seed-test-user-1');
        expect(data.email).toBe('seed@example.com');
    }, 30000);
});
