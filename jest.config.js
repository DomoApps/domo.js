const { createDefaultPreset } = require("ts-jest");

const transformFor = (tsconfig) => createDefaultPreset({ tsconfig }).transform;

/** @type {import("jest").Config} **/
module.exports = {
  projects: [
    {
      displayName: "sdk",
      testEnvironment: "jsdom",
      roots: ["<rootDir>/src"],
      transform: transformFor("tsconfig.test.json"),
    },
    {
      displayName: "ci",
      testEnvironment: "node",
      roots: ["<rootDir>/scripts/ci"],
      transform: transformFor("scripts/ci/tsconfig.json"),
    },
  ],
};
