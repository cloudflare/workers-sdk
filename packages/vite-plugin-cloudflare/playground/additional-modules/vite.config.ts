import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	plugins: [cloudflare()],
});
