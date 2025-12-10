import { firebasePromise } from "../lib/firebase.js";
import { startNotificationSchedulers } from "../notifications/notification.scheduler.js";

const startWorker = async () => {
    try {
        await firebasePromise;
        console.log('\u2705 Firebase Admin initialized (worker)');
        // Start the schedulers in this worker process
        startNotificationSchedulers();
        console.log('\u23f3 Scheduler worker started and running');
    } catch (err) {
        console.error('Worker failed to initialize Firebase', err);
        process.exit(1);
    }
};

startWorker();
