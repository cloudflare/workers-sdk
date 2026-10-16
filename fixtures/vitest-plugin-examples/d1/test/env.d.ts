declare namespace Cloudflare {
	interface Env {
		DATABASE: D1Database;
		TEST_MIGRATIONS: import("cloudflare:test").D1Migration[]; // Defined in `vitest.config.mts`
	}
}
