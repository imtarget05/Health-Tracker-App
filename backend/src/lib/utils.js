import jwt from "jsonwebtoken";
import { JWT_SECRET, NODE_ENV } from "../config/env.js";

export const generateToken = (userId, res) => {
    const token = jwt.sign({ userId }, JWT_SECRET, {
        expiresIn: "7d",
    });

    res.cookie("jwt", token, {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "strict",
        secure: NODE_ENV !== "development",
    });

    return token;
};

export const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};
