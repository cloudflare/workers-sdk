import { Fetcher } from "@cloudflare/workers-types/experimental";

declare module "cloudflare:test" {
	interface ProvidedEnv {
		MY_WORKER: Fetcher;
	}
}
