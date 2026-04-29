const dotenv = require('dotenv');
dotenv.config({ path: './.env.test' });

module.exports = {
    testEnvironment: 'node',
    transform: {
        '^.+\\.jsx?$': 'babel-jest',
    },
    testMatch: [
        '**/test/**/*.test.js',
        '**/__tests__/**/*.js',
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        String.raw`/\._`,  // Ignore backup/temp files like ._filename.js
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/index.js',
        '!src/config/**',
    ],
    coverageThreshold: {
        global: {
            branches: 25,
            functions: 25,
            lines: 25,
            statements: 25,
        },
    },
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/functions/',
        '/k8s/',
    ],
    verbose: true,
    testTimeout: 10000,
    forceExit: true,
    detectOpenHandles: true,
};
