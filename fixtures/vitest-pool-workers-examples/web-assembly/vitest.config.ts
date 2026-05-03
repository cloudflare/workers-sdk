import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
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
	})
);
