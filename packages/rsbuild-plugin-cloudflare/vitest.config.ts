import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			include: ["**/__tests__/**/*.spec.ts"],
			testTimeout: 60_000,
			server: {
				deps: {
					// `cloudflare.config.ts` files are loaded through Node's module hooks,
					// which Vitest's module runner would otherwise bypass.
					external: [/[/\\]packages[/\\]config[/\\]dist[/\\]/],
				},
			},
		},
	})
);
