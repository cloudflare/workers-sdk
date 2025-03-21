import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	plugins: [
		cloudflare({
			// the app relies on local state for its D1 data
			persistState: true,
		}),
	],
});
