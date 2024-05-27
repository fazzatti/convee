// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  moduleFileExtensions: ["ts", "js"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["html", "text"],
  testPathIgnorePatterns: ["/node_modules/", "/src/index-test.ts"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/index-test.ts", // Exclude index-test.ts from coverage
    "!src/**/*.d.ts", // Exclude TypeScript declaration files
    "!src/test/**/*", // Exclude test files
  ],
};
