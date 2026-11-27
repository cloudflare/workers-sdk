import { version } from "vitest/package.json";

export const vitestVersion = process.env.VITEST_VERSION ?? version;
