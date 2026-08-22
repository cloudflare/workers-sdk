import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// TODO: Configure Containers when they are supported by cloudflare.config.ts.
	plugins: [
		cloudflare({ types: { includeRuntime: false }, persistState: false }),
	],
});
