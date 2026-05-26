// Root vitest config for the vitest-pool-workers-examples fixture.
// Per the Vitest 4 docs, only `globalSetup`, `reporters`, `coverage`, and
// other "global" options are inherited from this root config; project test
// options (testTimeout, retry, etc.) are NOT inherited. Each project under
// `*/vitest.*config.*ts` extends `vitest.shared.ts` directly via mergeConfig.
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		reporters: ["default"],
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
