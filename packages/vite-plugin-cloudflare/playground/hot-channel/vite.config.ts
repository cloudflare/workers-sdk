import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		{
			name: "test-plugin",
			configureServer(viteDevServer) {
				const worker = viteDevServer.environments.ssr;
				assert(worker, `'ssr' environment not found`);

				return () => {
					viteDevServer.middlewares.use(async (_, __, next) => {
						worker.hot.on("worker-event", (payload) => {
							worker.hot.send("worker-event-received", payload);
						});
						worker.hot.send("server-event", "server-event-data");
						next();
					});
				};
			},
		},
		cloudflare({
			types: { includeRuntime: false },
			inspectorPort: false,
			persistState: false,
		}),
	],
});
