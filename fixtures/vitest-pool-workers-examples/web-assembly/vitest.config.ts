import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			// Specifying a `wrangler.configPath` will enable Wrangler's default
			// module rules including support for `.wasm` files. Refer to
			// https://developers.cloudflare.com/workers/wrangler/bundling/#files-which-will-not-be-bundled
			// for more information.
			wrangler: {
				configPath: "./wrangler.jsonc",
			},
		}),
	],

	test: {},
});
