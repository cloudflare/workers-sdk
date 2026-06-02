import * as wrangler from "wrangler";

export async function assertWranglerVersion(): Promise<void> {
	if (
		typeof wrangler.unstable_readConfig !== "function" ||
		typeof wrangler.unstable_getMiniflareWorkerOptions !== "function"
	) {
		throw new Error(
			"`@cloudflare/rsbuild-plugin-workers` requires a Wrangler version with unstable integration APIs."
		);
	}
}
