import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	mode: "with-specified-env",
	plugins: [cloudflare({ inspectorPort: 0, persistState: false })],
});
