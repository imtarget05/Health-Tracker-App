import Joi from 'joi';

/**
 * Validation schemas for request bodies
 * Usage: const { error, value } = authSchema.validate(req.body);
 */

// ============ AUTH SCHEMAS ============
export const signupSchema = Joi.object({
    fullName: Joi.string().max(100).optional(),
    email: Joi.string()
        .email({ minDomainSegments: 2 })
        .required()
        .messages({
            'string.email': 'Invalid email format',
            'any.required': 'Email is required',
        }),
    password: Joi.string()
        .min(6)
        .max(128)
        .required()
        .messages({
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required',
        }),
});

export const loginSchema = Joi.object({
    email: Joi.string()
        .email({ minDomainSegments: 2 })
        .required(),
    password: Joi.string()
        .min(6)
        .required(),
});

export const updateProfileSchema = Joi.object({
    fullName: Joi.string().max(100).optional(),
    profilePic: Joi.string().uri().optional(),
    height: Joi.number().min(50).max(250).optional().messages({
        'number.min': 'Height must be at least 50cm',
        'number.max': 'Height cannot exceed 250cm',
    }),
    weight: Joi.number().min(20).max(500).optional().messages({
        'number.min': 'Weight must be at least 20kg',
        'number.max': 'Weight cannot exceed 500kg',
    }),
}).min(1);

// ============ WATER SCHEMAS ============
export const waterLogSchema = Joi.object({
    amountMl: Joi.number()
        .integer()
        .min(1)
        .max(5000)
        .required()
        .messages({
            'number.min': 'Water amount must be at least 1ml',
            'number.max': 'Water amount cannot exceed 5000ml',
            'any.required': 'amountMl is required',
        }),
    date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// ============ MEAL SCHEMAS ============
export const mealSchema = Joi.object({
    name: Joi.string()
        .max(200)
        .required()
        .messages({
            'any.required': 'Meal name is required',
        }),
    calories: Joi.number()
        .integer()
        .min(0)
        .max(50000)
        .required()
        .messages({
            'number.min': 'Calories cannot be negative',
            'number.max': 'Calories seems too high',
        }),
    protein: Joi.number()
        .min(0)
        .max(500)
        .optional(),
    carbs: Joi.number()
        .min(0)
        .max(500)
        .optional(),
    fat: Joi.number()
        .min(0)
        .max(500)
        .optional(),
    portion_g: Joi.number()
        .min(0)
        .max(1000)
        .optional(),
    date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    mealType: Joi.string().valid('breakfast', 'lunch', 'dinner', 'snack').optional(),
});

export const mealFromDetectionSchema = Joi.object({
    detectionId: Joi.string().required().messages({
        'any.required': 'detectionId is required',
    }),
    mealType: Joi.string()
        .valid('breakfast', 'lunch', 'dinner', 'snack')
        .required()
        .messages({
            'any.required': 'mealType is required',
        }),
    date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time: Joi.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// ============ WORKOUT SCHEMAS ============
export const workoutSchema = Joi.object({
    type: Joi.string()
        .max(50)
        .required()
        .messages({
            'any.required': 'Workout type is required',
        }),
    duration: Joi.number()
        .integer()
        .min(1)
        .max(480)
        .required()
        .messages({
            'number.min': 'Duration must be at least 1 minute',
            'number.max': 'Duration cannot exceed 8 hours',
        }),
    caloriesBurned: Joi.number()
        .min(0)
        .max(100000)
        .optional(),
    date: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============ AI CHAT SCHEMAS ============
export const aiChatSchema = Joi.object({
    message: Joi.string()
        .max(2000)
        .required()
        .messages({
            'string.max': 'Message is too long (max 2000 characters)',
            'any.required': 'Message is required',
        }),
    history: Joi.array()
        .items(
            Joi.object({
                role: Joi.string().valid('user', 'assistant').required(),
                content: Joi.string().max(5000),
            })
        )
        .max(20)
        .optional(),
});

/**
 * Validation middleware helper
 * Usage in route: router.post('/endpoint', validateRequest(signupSchema), controllerFunction);
 */
export const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map(d => d.message).join(', ');
            return res.status(400).json({
                message: 'Validation error',
                errors: error.details.map(d => ({
                    field: d.path[0],
                    message: d.message,
                })),
            });
        }

        req.body = value; // Replace with sanitized value
        next();
    };
};

export default {
    signupSchema,
    loginSchema,
    updateProfileSchema,
    waterLogSchema,
    mealSchema,
    workoutSchema,
    aiChatSchema,
    validateRequest,
};
