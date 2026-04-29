// src/controllers/oauth.controller.js
import { firebasePromise, getAuth, getDb } from "../lib/firebase.js";
import { generateToken } from "../lib/utils.js";
import { OAuth2Client } from "google-auth-library";
import { GOOGLE_CLIENT_ID } from "../config/env.js";
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';
import fetch from 'node-fetch';

// ===== Limited Login (JWT) verification helpers =====
// Meta's Limited Login issues a JWT. Validating it requires verifying
// the JWT signature against Meta public keys (JWKS) and checking claims.
// We cache JWKS in-memory to avoid fetching on every request.
let _fbJwksCache = { fetchedAt: 0, keys: null };

const _isJwtLike = (t) => typeof t === 'string' && t.split('.').length === 3;

const _base64urlToBuffer = (s) => {
    // add padding
    const pad = 4 - (s.length % 4);
    const padded = s + (pad === 4 ? '' : '='.repeat(pad));
    return Buffer.from(padded.replaceAll(/-/g, '+').replaceAll(/_/g, '/'), 'base64');
};

const _jwkToPem = (jwk) => {
    // Build a PEM public key from RSA JWK using Node's crypto.
    const keyObj = createPublicKey({ key: jwk, format: 'jwk' });
    return keyObj.export({ format: 'pem', type: 'spki' });
};

const fetchFacebookJwks = async () => {
    // Cache for 6 hours
    const now = Date.now();
    if (_fbJwksCache.keys && (now - _fbJwksCache.fetchedAt) < 6 * 60 * 60 * 1000) {
        return _fbJwksCache.keys;
    }
    // Meta OpenID configuration + jwks
    // NOTE: This endpoint is used for token verification. If Meta changes
    // its issuer/jwks URLs, update here.
    const cfgResp = await fetch('https://www.facebook.com/.well-known/openid-configuration', {
        headers: {
            'User-Agent': 'HealthTrackerBackend/1.0 (+https://localhost)',
            'Accept': 'application/json',
        },
    });
    if (!cfgResp.ok) {
        throw new Error(`Failed to fetch Facebook OIDC config: ${cfgResp.status}`);
    }
    const cfg = await cfgResp.json();
    if (!cfg.jwks_uri) {
        throw new Error('Facebook OIDC config missing jwks_uri');
    }

    console.log('facebookAuth: jwks_uri=', cfg.jwks_uri);

    const jwksResp = await fetch(cfg.jwks_uri, {
        headers: {
            'User-Agent': 'HealthTrackerBackend/1.0 (+https://localhost)',
            'Accept': 'application/json',
        },
    });
    const jwksText = await jwksResp.text();
    if (!jwksResp.ok) {
        throw new Error(`Failed to fetch Facebook JWKS: ${jwksResp.status} body=${jwksText.slice(0, 200)}`);
    }
    const jwks = JSON.parse(jwksText);
    if (!jwks.keys || !Array.isArray(jwks.keys)) {
        throw new Error('Invalid JWKS payload');
    }
    _fbJwksCache = { fetchedAt: now, keys: jwks.keys };
    return _fbJwksCache.keys;
};

// Helper: validate JWT nonce claim against provided nonce (raw or digest)
const _validateJwtNonce = (payload, nonce) => {
    const tokenNonce = payload.nonce;
    const tokenNonceDigest = payload.nonce_digest;
    let nonceValid = false;
    if (tokenNonce != null && String(tokenNonce) === String(nonce)) {
        nonceValid = true;
    }
    if (!nonceValid && tokenNonceDigest != null) {
        const hash = crypto.createHash('sha256').update(String(nonce)).digest();
        const b64 = hash.toString('base64')
            .replaceAll(/=/g, '')
            .replaceAll(/\+/g, '-')
            .replaceAll(/\//g, '_');
        if (String(tokenNonceDigest) === b64) nonceValid = true;
    }
    if (!nonceValid) throw new Error('JWT nonce verification failed - possible replay attack');
};

const verifyFacebookLimitedLoginJwt = async ({ token, expectedAppId, nonce }) => {
    // Decode header to find kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded?.header) {
        throw new Error('Unable to decode JWT header');
    }
    const kid = decoded.header.kid;

    const jwks = await fetchFacebookJwks();
    const jwk = kid ? jwks.find(k => k.kid === kid) : null;
    const jwkFallback = !jwk && jwks.length ? jwks[0] : null;
    const selected = jwk || jwkFallback;
    if (!selected) {
        throw new Error('No JWKS key available to verify token');
    }

    const pem = _jwkToPem(selected);

    // Verify signature and basic claims.
    // We can't be perfectly strict across all Meta token variants, so we validate:
    // - signature (RS256)
    // - exp/nbf (jsonwebtoken checks exp automatically)
    // - audience includes our app id (where present)
    // - nonce equals provided nonce (if caller provides one and token has nonce)
    const payload = jwt.verify(token, pem, {
        algorithms: ['RS256'],
        // Some tokens may not have aud in the exact form; we check manually below.
        ignoreExpiration: false,
    });

    // Validate audience/app id when present
    const aud = payload.aud;
    const audOk = (typeof aud === 'string' && aud === expectedAppId) || (Array.isArray(aud) && aud.includes(expectedAppId));
    if (aud != null && !audOk) {
        throw new Error('JWT audience does not match FACEBOOK_APP_ID');
    }

    // SECURITY FIX: Validate nonce to prevent replay attacks
    // If nonce is provided, the token MUST contain matching nonce or nonce_digest
    if (nonce) {
        _validateJwtNonce(payload, nonce);
    }

    return payload;
};

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
// Helper: táº¡o hoáº·c láº¥y user theo email
const getOrCreateUserByEmail = async ({
    email,
    name,
    picture,
    provider,
    providerId,
}) => {
    await firebasePromise;
    const db = getDb();
    const auth = getAuth();

    // TÃ¬m trong Firestore trÆ°á»›c
    const usersSnapshot = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

    if (!usersSnapshot.empty) {
        const user = usersSnapshot.docs[0].data();
        return user;
    }

    // Náº¿u chÆ°a cÃ³, thá»­ táº¡o user trong Firebase Auth.
    // NhÆ°ng náº¿u email Ä‘Ã£ tá»“n táº¡i trong Firebase Auth (vÃ­ dá»¥ Ä‘Äƒng nháº­p báº±ng Google
    // khi ngÆ°á»i dÃ¹ng Ä‘Ã£ Ä‘Äƒng kÃ½ báº±ng email), thÃ¬ láº¥y user hiá»‡n cÃ³ vÃ  Ä‘áº£m báº£o
    // há»“ sÆ¡ Firestore tá»“n táº¡i. Äiá»u nÃ y cho phÃ©p luá»“ng Google sign-in cháº¥p nháº­n
    // email trÃ¹ng láº·p mÃ  khÃ´ng bÃ¡o lá»—i "Email already exists".
    try {
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
            // LÆ°u thÃªm provider info cho rÃµ rÃ ng
            provider,
            providerId,
        };

        await db.collection("users").doc(userRecord.uid).set(userProfile);

        return userProfile;
    } catch (err) {
        // Náº¿u lá»—i lÃ  email Ä‘Ã£ tá»“n táº¡i trong Firebase Auth, láº¥y user Ä‘Ã³ thay vÃ¬
        // tráº£ vá» lá»—i. Nhá»¯ng lá»—i khÃ¡c thÃ¬ nÃ©m tiáº¿p.
        if (err && (err.code === 'auth/email-already-exists' || err.message?.includes('email-already-exists'))) {
            console.log('getOrCreateUserByEmail: email exists in Auth, fetching existing user by email=', email);
            // Láº¥y thÃ´ng tin user tá»« Firebase Auth
            const existing = await auth.getUserByEmail(email);

            // Kiá»ƒm tra xem cÃ³ document Firestore cho uid nÃ y chÆ°a
            const userDoc = await db.collection('users').doc(existing.uid).get();
            if (userDoc.exists) {
                return userDoc.data();
            }

            // Náº¿u chÆ°a cÃ³ profile trong Firestore, táº¡o profile tá»« userRecord
            const createdAt = existing.metadata?.creationTime ? new Date(existing.metadata.creationTime).toISOString() : new Date().toISOString();
            const userProfile = {
                uid: existing.uid,
                email: existing.email,
                fullName: existing.displayName || name || '',
                profilePic: existing.photoURL || picture || '',
                createdAt,
                updatedAt: new Date().toISOString(),
                provider,
                providerId,
            };

            await db.collection('users').doc(existing.uid).set(userProfile);
            return userProfile;
        }

        throw err;
    }
};

// Helper: build response
const buildOAuthResponse = (user, token, firebaseCustomToken = null, existingAccount = false) => ({
    uid: user.uid,
    fullName: user.fullName,
    email: user.email,
    profilePic: user.profilePic || "",
    token,
    firebaseCustomToken,
    existingAccount,
});

// Helper: get or create user by provider (works even if email is missing)
// Strategy:
// - Use providerId as the stable key
// - If email missing, create a synthetic email to satisfy Firebase Auth requirements
//   (keeps existing code paths simple)
const getOrCreateUserByProvider = async ({
    provider,
    providerId,
    email,
    name,
    picture,
}) => {
    await firebasePromise;
    const db = getDb();
    const auth = getAuth();

    if (!provider || !providerId) {
        throw new Error('provider/providerId are required');
    }

    // 1) Try to find existing Firestore user by provider+providerId
    try {
        const snap = await db
            .collection('users')
            .where('provider', '==', provider)
            .where('providerId', '==', providerId)
            .limit(1)
            .get();
        if (!snap.empty) {
            return snap.docs[0].data();
        }
    } catch (e) {
        console.log('getOrCreateUserByProvider: Firestore lookup failed', e?.message || e);
    }

    // 2) If we have a real email, reuse existing email-based creation/linking
    if (email) {
        return await getOrCreateUserByEmail({ email, name, picture, provider, providerId });
    }

    // 3) No email: create a synthetic email (stable per providerId)
    // Use app domain that won't conflict with real users.
    const syntheticEmail = `${provider}_${providerId}@facebook.local`;

    // Create or fetch Firebase Auth user by that synthetic email
    let userRecord;
    try {
        userRecord = await auth.createUser({
            email: syntheticEmail,
            displayName: name || 'Facebook User',
            emailVerified: true,
            photoURL: picture || undefined,
        });
    } catch (err) {
        if (err && (err.code === 'auth/email-already-exists' || err.message?.includes('email-already-exists'))) {
            userRecord = await auth.getUserByEmail(syntheticEmail);
        } else {
            throw err;
        }
    }

    // Ensure Firestore profile exists
    const uid = userRecord.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
        return userDoc.data();
    }

    const userProfile = {
        uid,
        email: syntheticEmail,
        fullName: name || userRecord.displayName || 'Facebook User',
        profilePic: picture || userRecord.photoURL || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        provider,
        providerId,
        // Mark synthetic emails so you can migrate later if desired
        isSyntheticEmail: true,
    };

    await db.collection('users').doc(uid).set(userProfile);
    return userProfile;
};

// Helper: handle Facebook Limited Login (JWT path)
const _handleFacebookLimitedLogin = async (normalizedToken, nonce, res) => {
    try {
        const payload = await verifyFacebookLimitedLoginJwt({
            token: normalizedToken,
            expectedAppId: process.env.FACEBOOK_APP_ID,
            nonce: nonce ? String(nonce) : undefined,
        });
        const facebookId = payload.sub || payload.user_id || payload.id;
        const email = payload.email;
        const name = payload.name || payload.given_name || payload.family_name || 'Facebook User';
        const user = await getOrCreateUserByProvider({
            provider: 'facebook',
            providerId: facebookId || 'facebook',
            email,
            name,
            picture: '',
        });
        const token = generateToken(user.uid, res);
        return res.status(200).json(buildOAuthResponse(user, token));
    } catch (e) {
        console.log('facebookAuth: Limited Login JWT verification failed:', e?.message || e);
        return res.status(401).json({ message: 'Invalid Facebook token', details: { type: 'limited_login_jwt', error: e?.message || String(e) } });
    }
};

// Helper: verify Facebook access token via debug_token endpoint.
// Returns true to continue, false if request was already rejected.
const _runFacebookDebugToken = async (normalizedToken, rawToken, requestId, req, res) => {
    try {
        console.log('facebookAuth: requestId=', requestId);
        console.log('facebookAuth: using FACEBOOK_APP_ID=', process.env.FACEBOOK_APP_ID);
        const appAccess = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
        try {
            console.log('facebookAuth: appAccessHash=', crypto.createHash('sha256').update(appAccess).digest('hex'));
        } catch (hErr) {
            console.log('facebookAuth: failed computing appAccessHash', hErr?.message || hErr);
        }
        console.log('facebookAuth: tokenLength=', normalizedToken.length);
        console.log('facebookAuth: tokenHasWhitespace=', /\s/.test(rawToken));
        console.log('facebookAuth: tokenHasPipes=', normalizedToken.includes('|'));
        let userHash = null;
        try {
            userHash = crypto.createHash('sha256').update(normalizedToken).digest('hex');
            console.log('facebookAuth: userAccessHash=', userHash);
        } catch (uhErr) {
            console.log('facebookAuth: failed computing userAccessHash', uhErr?.message || uhErr);
        }
        try {
            const clientHash = req.get('X-Client-Token-Sha256');
            if (clientHash) {
                console.log('facebookAuth: clientTokenSha256=', clientHash);
                if (userHash && clientHash !== userHash) {
                    console.log('facebookAuth: token hash mismatch client vs received', clientHash, userHash);
                    if (process.env.NODE_ENV !== 'production') {
                        res.status(401).json({ message: 'Invalid Facebook token', details: { reason: 'token_hash_mismatch', clientHash, serverHash: userHash } });
                        return false;
                    }
                }
            }
        } catch (hdrErr) {
            console.log('facebookAuth: failed reading client header X-Client-Token-Sha256', hdrErr?.message || hdrErr);
        }
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(normalizedToken)}&access_token=${encodeURIComponent(appAccess)}`;
        const debugResp = await fetch(debugUrl);
        const debugData = await debugResp.json();
        console.log('facebookAuth: debug_token status=', debugResp.status, 'body=', JSON.stringify(debugData));
        if (!debugResp.ok || !debugData?.data?.is_valid) {
            res.status(401).json({ message: 'Invalid Facebook token', details: { type: 'graph_debug_token', data: debugData } });
            return false;
        }
        if (debugData.data.app_id && debugData.data.app_id !== process.env.FACEBOOK_APP_ID) {
            console.log('Facebook token app_id mismatch:', debugData.data.app_id);
            res.status(401).json({ message: 'Facebook token does not belong to this app', details: debugData });
            return false;
        }
        return true;
    } catch (e) {
        console.log('Error while debugging Facebook token (fetch/debug_token):', e?.message || e);
        return true; // fallthrough: proceed to /me call
    }
};

// ============= FACEBOOK AUTH =============
export const facebookAuth = async (req, res) => {
    try {
        const { accessToken, nonce } = req.body;

        // Correlation id to tie client request -> server logs (safe to log)
        const requestId = req.get('X-Request-Id') || crypto.randomUUID();
        res.set('X-Request-Id', requestId);

        if (!accessToken) {
            return res.status(400).json({ message: "Access token is required" });
        }

        // Normalize incoming token to a clean string (avoid quotes/newlines causing mis-detection).
        const rawToken = String(accessToken ?? '');
        const normalizedToken = rawToken
            .trim()
            .replaceAll(/^"|"$/g, '')
            .replaceAll(/\s+/g, '');

        // If token looks like a JWT (Limited Login), verify via JWKS.
        if (_isJwtLike(normalizedToken) || normalizedToken.startsWith('eyJ')) {
            console.log('facebookAuth: detected JWT-like token (Limited Login)');
            return _handleFacebookLimitedLogin(normalizedToken, nonce, res);
        }

        // Otherwise: classic access token flow with debug_token
        const debugOk = await _runFacebookDebugToken(normalizedToken, rawToken, requestId, req, res);
        if (!debugOk) return;

        const facebookResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${encodeURIComponent(normalizedToken)}`
        );
        const facebookData = await facebookResponse.json();
        if (!facebookResponse.ok) {
            console.error("Facebook token error:", facebookData);
            return res.status(401).json({ message: "Invalid Facebook token", details: facebookData });
        }
        const { id: facebookId, name, email, picture } = facebookData;
        if (!email) {
            return res.status(400).json({ message: "Facebook account does not have a public email" });
        }
        const profilePicUrl = picture?.data?.url || "";
        const user = await getOrCreateUserByEmail({ email, name, picture: profilePicUrl, provider: "facebook", providerId: facebookId });
        const token = generateToken(user.uid, res);
        return res.status(200).json(buildOAuthResponse(user, token));
    } catch (error) {
        console.error("Error in Facebook auth:", error);
        if (error.code === "auth/email-already-exists") {
            return res.status(400).json({ message: "Email already exists" });
        }
        return res.status(500).json({ message: "Internal server error" });
    }
};
// Lightweight test endpoint for health-checking Facebook auth wiring.
// Does not create users or modify data. Returns whether JWKS can be fetched
// and whether FACEBOOK_APP_ID is configured.
export const facebookAuthTest = async (req, res) => {
    try {
        const jwksReady = !!_fbJwksCache.keys?.length;
        let jwksCount = jwksReady ? _fbJwksCache.keys.length : 0;
        // Try fetching JWKS if not cached yet, but don't fail on errors.
        if (!jwksReady) {
            try {
                const keys = await fetchFacebookJwks();
                jwksCount = keys.length;
            } catch (e) {
                console.warn('facebookAuthTest: failed to fetch JWKS', e?.message || e);
            }
        }

        return res.status(200).json({
            ok: true,
            facebookAppIdPresent: !!process.env.FACEBOOK_APP_ID,
            jwksCached: jwksReady,
            jwksCount,
            time: new Date().toISOString(),
        });
    } catch (e) {
        return res.status(500).json({ ok: false, error: String(e) });
    }
};

// ============= GOOGLE AUTH =============
export const googleAuth = async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ message: "Google ID token is required" });
        }

        console.log('googleAuth: received idToken length=', idToken ? idToken.length : 0);

        // Support a single GOOGLE_CLIENT_ID or multiple comma-separated client IDs
        // (useful when accepting tokens from iOS and web clients).
        const rawAud = process.env.GOOGLE_CLIENT_ID || '';
        const allowedAudiences = rawAud.split(',').map(a => a.trim()).filter(Boolean);
        console.log('googleAuth: allowedAudiences=', allowedAudiences);

        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: allowedAudiences.length > 0 ? allowedAudiences : undefined,
        });

        const googleUser = ticket.getPayload();

        console.log('googleAuth: verifyIdToken payload=', googleUser);

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

        // attempt to create firebase custom token so FE can sign in client SDK
        let firebaseCustomToken = null;
        try {
            await firebasePromise;
            firebaseCustomToken = await getAuth().createCustomToken(user.uid);
        } catch (tkErr) {
            console.warn('[googleAuth] failed to create firebase custom token', tkErr && (tkErr.message || tkErr));
        }

        return res.status(200).json(buildOAuthResponse(user, token, firebaseCustomToken, true));
    } catch (error) {
        console.error("Error in Google auth:", error?.stack || error);

        if (error.code === "auth/email-already-exists") {
            return res.status(400).json({ message: "Email already exists" });
        }

        // In development return the real error to help debugging
        if (process.env.NODE_ENV !== 'production') {
            return res.status(500).json({ message: error.message || 'Internal server error', stack: error.stack });
        }

        return res.status(500).json({ message: "Internal server error" });
    }
};
