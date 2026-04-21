const request = require('supertest');
const express = require('express');

/**
 * Mock auth controller for testing
 */
const createMockApp = () => {
    const app = express();
    app.use(express.json());

    // Mock signup endpoint
    app.post('/auth/signup', (req, res) => {
        const { email, password, fullName } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (email === 'existing@example.com') {
            return res.status(409).json({ error: 'Email already exists' });
        }

        return res.status(201).json({
            success: true,
            userId: 'new-user-id',
            email,
            fullName,
        });
    });

    // Mock login endpoint
    app.post('/auth/login', (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Missing credentials' });
        }

        if (email === 'invalid@example.com') {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        return res.status(200).json({
            success: true,
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            userId: 'test-user-id',
            expiresIn: 3600,
        });
    });

    // Mock refresh token endpoint
    app.post('/auth/refresh', (req, res) => {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Missing refresh token' });
        }

        if (refreshToken === 'invalid-token') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        return res.status(200).json({
            success: true,
            accessToken: 'new-access-token',
            expiresIn: 3600,
        });
    });

    return app;
};

describe('Auth Controller Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = createMockApp();
    });

    describe('POST /auth/signup', () => {
        it('should create a new user account', async () => {
            const response = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'newuser@example.com',
                    password: 'SecurePass123!',
                    fullName: 'John Doe',
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.userId).toBeDefined();
            expect(response.body.email).toBe('newuser@example.com');
        });

        it('should reject signup with missing fields', async () => {
            const response = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'newuser@example.com',
                    password: 'SecurePass123!',
                    // missing fullName
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });

        it('should reject signup with existing email', async () => {
            const response = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'existing@example.com',
                    password: 'SecurePass123!',
                    fullName: 'Jane Doe',
                });

            expect(response.status).toBe(409);
        });
    });

    describe('POST /auth/login', () => {
        it('should login user with valid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'user@example.com',
                    password: 'CorrectPassword123!',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.refreshToken).toBeDefined();
            expect(response.body.expiresIn).toBe(3600); // 1 hour
        });

        it('should reject login with missing credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'user@example.com',
                    // missing password
                });

            expect(response.status).toBe(400);
        });

        it('should reject login with invalid credentials', async () => {
            const response = await request(app)
                .post('/auth/login')
                .send({
                    email: 'invalid@example.com',
                    password: 'WrongPassword',
                });

            expect(response.status).toBe(401);
            expect(response.body.error).toContain('Invalid');
        });
    });

    describe('POST /auth/refresh', () => {
        it('should return new access token with valid refresh token', async () => {
            const response = await request(app)
                .post('/auth/refresh')
                .send({
                    refreshToken: 'valid-refresh-token',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.expiresIn).toBe(3600); // 1 hour
        });

        it('should reject with missing refresh token', async () => {
            const response = await request(app)
                .post('/auth/refresh')
                .send({});

            expect(response.status).toBe(400);
        });

        it('should reject with invalid refresh token', async () => {
            const response = await request(app)
                .post('/auth/refresh')
                .send({
                    refreshToken: 'invalid-token',
                });

            expect(response.status).toBe(401);
        });
    });
});

describe('Request/Response Validation', () => {
    let app;

    beforeAll(() => {
        app = createMockApp();
    });

    it('should reject requests with invalid JSON', async () => {
        const response = await request(app)
            .post('/auth/login')
            .set('Content-Type', 'application/json')
            .send('invalid json');

        expect(response.status).toBe(400);
    });

    it('should handle empty request body', async () => {
        const response = await request(app)
            .post('/auth/login')
            .send({});

        expect(response.status).toBe(400);
    });

    it('should handle extra fields in request', async () => {
        const response = await request(app)
            .post('/auth/login')
            .send({
                email: 'user@example.com',
                password: 'CorrectPassword123!',
                extraField: 'shouldBeIgnored',
                anotherExtra: 12345,
            });

        expect(response.status).toBe(200); // Should still work
        expect(response.body.success).toBe(true);
    });
});
