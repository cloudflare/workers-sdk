import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { satisfiesMinimumViteVersion } from "../__test-utils__/vite-version";

export default defineConfig(
	// `experimental.bundledDev` is a Vite 8+ feature so these tests are skipped
	// on older Vite versions. We return an empty Vite config so that the dev
	// server can still start quickly.
	!satisfiesMinimumViteVersion("8.0.0")
		? {}
		: {
				experimental: { bundledDev: true },
				plugins: [
					react(),
					cloudflare({
						types: { includeRuntime: false },
						inspectorPort: false,
						persistState: false,
					}),
				],
			}
);
