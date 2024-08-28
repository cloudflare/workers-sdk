/**
 * This Worker is used as a default entry-point for Assets-only
 * Workers. It proxies the request directly on to the Asset Sever
 * Worker service binding.
 *
 * In an Assets-only Workers world, we want to enable users
 * to deploy a Worker with Assets without ever having to provide
 * a User Worker.
 *
 * ```bash
 * wrangler dev --experimental-assets dist
 * wrangler deploy --experimental-assets dist
 * ```
 *
 * ```toml
 * name = "assets-only-worker"
 * compatibility_date = "2024-01-01"
 * ```
 *
 * Without a user-defined Worker, which usually serves as the entry
 * point in the bundling process, wrangler needs to default to some
 * other entry-point Worker for all intents and purposes. This is what
 * this Worker is.
 */
type Env = {
	ASSET_WORKER: Fetcher;
};

export default {
	async fetch(request: Request, env: Env) {
		return env.ASSET_WORKER.fetch(request);
	},
};
