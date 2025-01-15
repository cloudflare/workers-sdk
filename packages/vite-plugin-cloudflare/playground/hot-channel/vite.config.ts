import assert from "node:assert";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({ persistState: false }),
		{
			name: "test-plugin",
			configureServer(viteDevServer) {
				const worker = viteDevServer.environments.worker;
				assert(worker, `'worker' environment not found`);

				return () => {
					viteDevServer.middlewares.use(async (req, res, next) => {
						worker.hot.send("server-event", "server-event-data");
						worker.hot.on("client-event", (payload) => {
							worker.hot.send("client-event-received", payload);
						});
						next();
					});
				};
			},
		},
	],
});
