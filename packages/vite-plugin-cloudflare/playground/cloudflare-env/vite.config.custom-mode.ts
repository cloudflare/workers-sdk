import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	mode: "custom-mode",
	plugins: [cloudflare({ persistState: false })],
});
