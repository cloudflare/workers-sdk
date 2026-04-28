// Root vitest config for the vitest-pool-workers-examples fixture.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		teardownTimeout: 1_000,
		projects: [
			"*/vitest.*config.*ts",
			// workerd's Windows SQLite VFS uses kj::Path::toString() (Unix-style
			// paths) with the win32 VFS, causing SQLITE_CANTOPEN for disk-backed
			// SQLite DOs. Exclude until workerd ships the fix (cloudflare/workerd#6110).
			...(process.platform === "win32"
				? ["!durable-objects/vitest.*config.*ts"]
				: []),
		],
		globalSetup: ["./vitest.global.ts"],
	},
});
