import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				// Loading `cloudflare.config.ts` with `config` enables the default module
				// rules, including support for `.wasm` files.
				config: true,
			}),
		],
	})
);
