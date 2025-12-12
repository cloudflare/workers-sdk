// This file is named `vitest.workers.config.ts` so it doesn't get included
// in the monorepo's `vitest.workspace.ts`.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: ["*/vitest.*config.*ts"],
		globalSetup: ["./vitest.global.ts"],
	},
});
