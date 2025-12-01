import { db } from '../lib/firebase.js';
import { verifyToken } from '../lib/utils.js';

export const protectRoute = async (req, res, next) => {
    try {
        const token = req.cookies.jwt || (req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.split(" ")[1]
            : null);

        if (!token) {
            return res.status(401).json({ message: "Not authorized, no token" });
        }

        const decoded = verifyToken(token); // { userId }

        const userDoc = await db.collection('users').doc(decoded.userId).get();
        if (!userDoc.exists) {
            return res.status(401).json({ message: "User not found" });
        }

        req.user = userDoc.data();
        next();
    } catch (error) {
        console.log("Error in auth middleware", error.message);
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
