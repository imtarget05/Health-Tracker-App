// src/controllers/oauth.controller.js
import { auth, db } from "../lib/firebase.js";
import { generateToken } from "../lib/utils.js";
import { OAuth2Client } from "google-auth-library";
import { GOOGLE_CLIENT_ID } from "../config/env.js";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
// Helper: tạo hoặc lấy user theo email
const getOrCreateUserByEmail = async ({
    email,
    name,
    picture,
    provider,
    providerId,
}) => {
    // Tìm trong Firestore trước
    const usersSnapshot = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

    if (!usersSnapshot.empty) {
        const user = usersSnapshot.docs[0].data();
        return user;
    }

    // Nếu chưa có, tạo user trong Firebase Auth
    const userRecord = await auth.createUser({
        email,
        displayName: name,
        emailVerified: true,
        photoURL: picture || undefined,
    });

    const userProfile = {
        uid: userRecord.uid,
        email,
        fullName: name,
        profilePic: picture || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Lưu thêm provider info cho rõ ràng
        provider,
        providerId,
    };

    await db.collection("users").doc(userRecord.uid).set(userProfile);

    return userProfile;
};

// Helper: build response
const buildOAuthResponse = (user, token) => ({
    uid: user.uid,
    fullName: user.fullName,
    email: user.email,
    profilePic: user.profilePic || "",
    token,
});

// ============= FACEBOOK AUTH =============
export const facebookAuth = async (req, res) => {
    try {
        const { accessToken } = req.body;

        if (!accessToken) {
            return res.status(400).json({ message: "Access token is required" });
        }

        const facebookResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${accessToken}`
        );

        const facebookData = await facebookResponse.json();

        if (!facebookResponse.ok) {
            console.log("Facebook token error:", facebookData);
            return res.status(401).json({ message: "Invalid Facebook token" });
        }

        const { id: facebookId, name, email, picture } = facebookData;

        if (!email) {
            // Có trường hợp Facebook không trả email (privacy setting)
            return res.status(400).json({
                message: "Facebook account does not have a public email",
            });
        }

        const profilePicUrl = picture?.data?.url || "";

        const user = await getOrCreateUserByEmail({
            email,
            name,
            picture: profilePicUrl,
            provider: "facebook",
            providerId: facebookId,
        });

        const token = generateToken(user.uid, res);

        return res.status(200).json(buildOAuthResponse(user, token));
    } catch (error) {
        console.log("Error in Facebook auth:", error);

        if (error.code === "auth/email-already-exists") {
            return res.status(400).json({ message: "Email already exists" });
        }

        return res.status(500).json({ message: "Internal server error" });
    }
};

// ============= GOOGLE AUTH =============
export const googleAuth = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ message: "Google ID token is required" });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const googleUser = ticket.getPayload();

        if (!googleUser) {
            return res.status(401).json({ message: "Invalid Google token" });
        }

        const { sub: googleId, name, email, picture } = googleUser;

        if (!email) {
            return res.status(400).json({
                message: "Google account does not have an email",
            });
        }

        const user = await getOrCreateUserByEmail({
            email,
            name,
            picture,
            provider: "google",
            providerId: googleId,
        });

        const token = generateToken(user.uid, res);

        return res.status(200).json(buildOAuthResponse(user, token));
    } catch (error) {
        console.log("Error in Google auth:", error);

        if (error.code === "auth/email-already-exists") {
            return res.status(400).json({ message: "Email already exists" });
        }

        return res.status(500).json({ message: "Internal server error" });
    }
};
