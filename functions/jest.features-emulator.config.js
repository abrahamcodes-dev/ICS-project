module.exports = {
  preset: 'ts-jest', testEnvironment: 'node', rootDir: '.', testTimeout: 120000,
  testMatch: ['<rootDir>/emulator-checks/consent.test.ts', '<rootDir>/emulator-checks/attachments.test.ts', '<rootDir>/emulator-checks/deletion.test.ts'],
};
