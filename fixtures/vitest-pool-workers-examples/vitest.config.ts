// This file is named `vitest.workers.config.ts` so it doesn't get included
// in the monorepo's `vitest.workspace.ts`.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		teardownTimeout: 1_000,
		projects: [
			"*/vitest.*config.*ts",
			// workerd's SQLite VFS on Windows uses kj::Path::toString() which produces
			// Unix-style forward-slash paths, causing SQLITE_CANTOPEN with the win32 VFS.
			// Exclude SQLite-backed DO fixtures until workerd fixes sqlite.c++:511.
			...(process.platform === "win32"
				? ["!durable-objects/vitest.*config.*ts"]
				: []),
		],
		globalSetup: ["./vitest.global.ts"],
	},
});
