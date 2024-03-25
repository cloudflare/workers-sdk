import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				// Specifying a `wrangler.configPath` will enable Wrangler's default
				// module rules including support for `.wasm` files. Refer to
				// https://developers.cloudflare.com/workers/wrangler/bundling/#files-which-will-not-be-bundled
				// for more information.
				wrangler: {
					configPath: "./wrangler.toml",
				},
			},
		},
	},
});
