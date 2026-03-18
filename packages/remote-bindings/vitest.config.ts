import { defineConfig, mergeConfig } from "vitest/config";
import configShared from "../../vitest.shared";

export default mergeConfig(
	configShared,
	defineConfig({
		resolve: {
			alias: {
				// The virtual module is resolved by the tsdown rolldown plugin at build time.
				// For vitest (which runs source directly), provide a stub.
				"virtual:proxy-server-worker":
					"./test/__stubs__/proxy-server-worker.ts",
			},
		},
	})
);
