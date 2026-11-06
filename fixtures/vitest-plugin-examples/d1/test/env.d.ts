declare namespace Cloudflare {
	interface Env {
		TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]; // Defined in `vitest.config.mts`
	}
}
