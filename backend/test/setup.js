// Test setup file for ES modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-min-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars';
process.env.FIREBASE_API_KEY = 'test-api-key';
process.env.DATABASE_URL = 'sqlite:///:memory:';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests

// Jest timeout for all tests
jest.setTimeout(10000);
