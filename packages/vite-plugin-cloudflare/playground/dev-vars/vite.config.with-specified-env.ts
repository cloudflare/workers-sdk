import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

process.env.CLOUDFLARE_ENV = "staging";

export default defineConfig({
	plugins: [cloudflare({ persistState: false })],
});
