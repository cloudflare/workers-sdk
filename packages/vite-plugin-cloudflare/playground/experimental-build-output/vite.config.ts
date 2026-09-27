import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { satisfiesMinimumViteVersion } from "../__test-utils__/vite-version";

const config = {
	environments: {
		build_output_worker: {
			build: {
				sourcemap: true,
			},
		},
	},
	plugins: [
		cloudflare({
			inspectorPort: false,
			persistState: false,
			experimental: {
				newConfig: { cfBuildOutput: true, types: { includeRuntime: false } },
			},
		}),
	],
};

// Building Containers into Build Output requires the `buildApp` hook,
// which is not supported in Vite 6. Return an empty config so that the
// shared playground setup can still start a preview server for skipped tests.
export default defineConfig(satisfiesMinimumViteVersion("7.0.0") ? config : {});
