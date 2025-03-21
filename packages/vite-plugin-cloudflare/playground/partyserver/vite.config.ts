import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	plugins: [react(), cloudflare()],
});
