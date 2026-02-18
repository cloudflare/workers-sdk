// This file is named `vitest.workers.config.ts` so it doesn't get included
// in the monorepo's `vitest.workspace.ts`.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		teardownTimeout: 1_000,
		projects: [
			"*/vitest.*config.*ts",
			// workerd's disk service has issues with SQLite on Windows,
			// so exclude fixtures that use SQLite-backed Durable Objects
			...(process.platform === "win32"
				? ["!durable-objects/vitest.*config.*ts"]
				: []),
		],
		globalSetup: ["./vitest.global.ts"],
	},
});
