import assert from "node:assert";
import { defineConfig } from "vite";
import { cloudflare } from "../__test-utils__/plugin";

export default defineConfig({
	plugins: [
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
		cloudflare(),
	],
});
