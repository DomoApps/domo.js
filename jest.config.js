const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  projects: [
    {
      displayName: "sdk",
      testEnvironment: "jsdom",
      transform: { ...tsJestTransformCfg },
      testMatch: ["<rootDir>/src/**/*.test.ts"],
    },
    {
      displayName: "ci",
      testEnvironment: "node",
      transform: { ...tsJestTransformCfg },
      testMatch: ["<rootDir>/scripts/ci/__tests__/**/*.test.ts"],
    },
  ],
};