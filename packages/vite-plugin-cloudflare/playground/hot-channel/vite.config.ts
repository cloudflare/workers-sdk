import assert from "node:assert";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [
		{
			name: "test-plugin",
			configureServer(viteDevServer) {
				const worker = viteDevServer.environments.worker;
				assert(worker, `'worker' environment not found`);

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
		cloudflare({ inspectorPort: false, persistState: false }),
	],
});
