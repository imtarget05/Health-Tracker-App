import { firebasePromise, getDb } from '../lib/firebase.js';
import { verifyToken } from '../lib/utils.js';

// Factory for creating a protectRoute middleware with injected dependencies (useful for tests)
export const createProtectRoute = ({ firebasePromise: fp = firebasePromise, getDb: getDbFn = getDb, verify = verifyToken } = {}) => {
    return async (req, res, next) => {
        try {
            const token = req.cookies.jwt || (req.headers.authorization?.startsWith("Bearer ")
                ? req.headers.authorization.split(" ")[1]
                : null);

            if (!token) {
                return res.status(401).json({ message: "Not authorized, no token" });
            }

            const decoded = verify(token); // { userId }

            // ensure firebase initialized and get db safely
            await fp;
            const db = getDbFn();

            const userDoc = await db.collection('users').doc(decoded.userId).get();
            if (!userDoc.exists) {
                return res.status(401).json({ message: "User not found" });
            }

            req.user = userDoc.data();
            next();
        } catch (error) {
            console.log("Error in auth middleware", error?.message || error);
            return res.status(401).json({ message: "Invalid or expired token" });
        }
    };
};

// Default middleware for production usage
export const protectRoute = createProtectRoute();
