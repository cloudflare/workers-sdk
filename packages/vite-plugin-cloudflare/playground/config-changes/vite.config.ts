import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// We leave the `inspectorPort` enabled in this playground to verify that there are no port collisions on server restarts
	plugins: [cloudflare({ persistState: false })],
});
