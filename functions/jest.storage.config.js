module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/__tests__/storage/**/*.test.ts"],
  testTimeout: 60000,
};
