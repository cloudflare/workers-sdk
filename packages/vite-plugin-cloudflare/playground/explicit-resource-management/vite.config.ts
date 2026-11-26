import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	// The test harness builds at `esnext`, which never lowers anything. A client
	// target that predates `using` shows whether the Worker-only esbuild override
	// leaks into the client build. Worker environments set their own target.
	build: { target: "es2024" },
	plugins: [cloudflare({ inspectorPort: false, persistState: false })],
});
