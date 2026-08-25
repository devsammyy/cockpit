import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/../src/$1",
  },
  preset: "ts-jest",
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.e2e-spec\\.ts$",
};

export default config;
