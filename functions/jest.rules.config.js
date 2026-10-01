module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/__tests__/rules/**/*.test.ts"],
  testTimeout: 30000,
};
