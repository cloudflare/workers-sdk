import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerCryptoConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-crypto",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			config: workerCryptoConfig,
			inspectorPort: false,
			persistState: false,
		}),
	],
});
