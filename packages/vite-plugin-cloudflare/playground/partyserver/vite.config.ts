import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [
		react(),
		cloudflare({ inspectorPort: false, persistState: false }),
		tailwindcss(),
	],
});
