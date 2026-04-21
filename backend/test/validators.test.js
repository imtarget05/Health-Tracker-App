// Convert to CommonJS for Jest compatibility
import('joi').then(() => { }).catch(() => { });  // Pre-load for jest

// Import using dynamic import (works with babel transformation)
const { signupSchema, loginSchema, waterLogSchema, mealLogSchema, workoutSchema } = require('../src/lib/validators.js');

describe('Validators Module', () => {
    describe('signupSchema', () => {
        it('should validate correct signup data', async () => {
            const data = {
                email: 'user@example.com',
                password: 'SecurePass123!',
                fullName: 'John Doe',
            };

            const { error, value } = signupSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.email).toBe('user@example.com');
        });

        it('should reject invalid email', async () => {
            const data = {
                email: 'invalid-email',
                password: 'SecurePass123!',
                fullName: 'John Doe',
            };

            const { error } = signupSchema.validate(data);
            expect(error).toBeDefined();
            expect(error.message).toContain('email');
        });

        it('should reject password shorter than 6 characters', async () => {
            const data = {
                email: 'user@example.com',
                password: 'short',
                fullName: 'John Doe',
            };

            const { error } = signupSchema.validate(data);
            expect(error).toBeDefined();
            expect(error.message).toContain('password');
        });

        it('should require email', async () => {
            const data = {
                password: 'SecurePass123!',
                fullName: 'John Doe',
            };

            const { error } = signupSchema.validate(data);
            expect(error).toBeDefined();
        });
    });

    describe('loginSchema', () => {
        it('should validate correct login data', async () => {
            const data = {
                email: 'user@example.com',
                password: 'SecurePass123!',
            };

            const { error, value } = loginSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.email).toBe('user@example.com');
        });

        it('should reject missing password', async () => {
            const data = {
                email: 'user@example.com',
            };

            const { error } = loginSchema.validate(data);
            expect(error).toBeDefined();
        });

        it('should reject missing email', async () => {
            const data = {
                password: 'SecurePass123!',
            };

            const { error } = loginSchema.validate(data);
            expect(error).toBeDefined();
        });
    });

    describe('waterLogSchema', () => {
        it('should validate water intake in range 1-5000ml', async () => {
            const data = {
                amount: 500,
            };

            const { error, value } = waterLogSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.amount).toBe(500);
        });

        it('should reject amount less than 1ml', async () => {
            const data = {
                amount: 0,
            };

            const { error } = waterLogSchema.validate(data);
            expect(error).toBeDefined();
        });

        it('should reject amount greater than 5000ml', async () => {
            const data = {
                amount: 5001,
            };

            const { error } = waterLogSchema.validate(data);
            expect(error).toBeDefined();
        });

        it('should reject non-numeric amount', async () => {
            const data = {
                amount: 'not-a-number',
            };

            const { error } = waterLogSchema.validate(data);
            expect(error).toBeDefined();
        });
    });

    describe('mealLogSchema', () => {
        it('should validate correct meal data', async () => {
            const data = {
                foodName: 'Apple',
                calories: 95,
                protein: 0.5,
                carbs: 25,
                fat: 0.3,
            };

            const { error, value } = mealLogSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.foodName).toBe('Apple');
        });

        it('should allow optional nutritional values', async () => {
            const data = {
                foodName: 'Chicken',
            };

            const { error, value } = mealLogSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.foodName).toBe('Chicken');
        });

        it('should reject negative calories', async () => {
            const data = {
                foodName: 'Apple',
                calories: -100,
            };

            const { error } = mealLogSchema.validate(data);
            expect(error).toBeDefined();
        });
    });

    describe('workoutSchema', () => {
        it('should validate correct workout data', async () => {
            const data = {
                type: 'Running',
                duration: 30,
                calories: 300,
            };

            const { error, value } = workoutSchema.validate(data);
            expect(error).toBeUndefined();
            expect(value.type).toBe('Running');
        });

        it('should require workout type and duration', async () => {
            const data = {
                calories: 300,
            };

            const { error } = workoutSchema.validate(data);
            expect(error).toBeDefined();
        });

        it('should reject duration less than 1 minute', async () => {
            const data = {
                type: 'Gym',
                duration: 0,
            };

            const { error } = workoutSchema.validate(data);
            expect(error).toBeDefined();
        });

        it('should reject duration greater than 480 minutes', async () => {
            const data = {
                type: 'Gym',
                duration: 481,
            };

            const { error } = workoutSchema.validate(data);
            expect(error).toBeDefined();
        });
    });
});
