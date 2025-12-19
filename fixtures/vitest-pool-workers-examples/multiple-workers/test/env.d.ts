declare namespace Cloudflare {
	interface Env {
		DATABASE_SERVICE: Fetcher;
		TEST_AUTH_PUBLIC_KEY: string; // Defined in `vitest.config.mts`
	}
}
