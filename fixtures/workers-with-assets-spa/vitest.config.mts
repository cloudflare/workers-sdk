import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		test: {
			// The `runWranglerDev` helper will wait up to 50 secs for Wrangler to boot up
			// The `chromium.launch` helper will wait up to 30 secs for the browser to boot up.
			reporters: ["default"],
			hookTimeout: 50_000,
			testTimeout: 50_000,
		},
	})
);
