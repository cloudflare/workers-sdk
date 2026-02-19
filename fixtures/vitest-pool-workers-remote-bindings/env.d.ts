declare namespace Cloudflare {
	interface Env {
		MY_WORKER: import("@cloudflare/workers-types/experimental").Fetcher;
	}
}
