import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      include: ["**/*.test.ts"], // Add your test files in gateway or services
      testTimeout: 15000
    },
  })
);
