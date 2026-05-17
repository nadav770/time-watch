'use strict';

// All test files share the same PostgreSQL database and call migrate.rollback + migrate.latest
// in beforeAll/afterAll. Running them in parallel workers causes race conditions on migrations.
// --runInBand (maxWorkers: 1) keeps execution serial.
module.exports = {
  testEnvironment: 'node',
  maxWorkers: 1,
  preset: 'ts-jest',
  setupFiles: ['./jest.setup.js'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/__tests__/helpers/',
  ],
  moduleFileExtensions: ['ts', 'js'],
};
