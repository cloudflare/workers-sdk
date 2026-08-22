import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { cloudflareNodeConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/cloudflare-node",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: cloudflareNodeConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
