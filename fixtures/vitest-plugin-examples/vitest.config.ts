// Root vitest config for the vitest-plugin-examples fixture.
// File-based projects use only run-level options (`globalSetup`, `reporters`,
// `coverage`, etc.) from this root config; project test options (testTimeout,
// retry, etc.) are NOT inherited. Each project under
// `*/vitest.*config.*ts` extends `vitest.shared.ts` directly via mergeConfig.
import { defineConfig } from "vitest/config";

// Local Containers need a Linux Docker engine, which hosted non-Linux CI
// runners lack, and do not support native Windows.
const skipContainerProject =
	process.platform === "win32" ||
	(process.platform !== "linux" &&
		(process.env.CI === "true" || process.env.CI === "1"));

export default defineConfig({
	test: {
		reporters: ["default"],
		projects: [
			"*/vitest.*config.*ts",
			// The disabled Container project still runs everywhere.
			...(skipContainerProject ? ["!container-app/vitest.config.ts"] : []),
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
