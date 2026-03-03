import { cloudflare, createPlugin } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			configPath: "./wrangler.with-api.jsonc",
			inspectorPort: false,
			persistState: false,
			experimental: {
				additionalPlugins: [
					createPlugin("test-plugin", (ctx) => ({
						configureServer(server) {
							server.middlewares.use((req, res, next) => {
								if (req.url === "/__experimental-plugin-test") {
									const config = ctx.resolvedPluginConfig;
									res.setHeader("Content-Type", "application/json");
									res.end(
										JSON.stringify({
											type: config.type,
											hasMiniflare: ctx.miniflare !== undefined,
										})
									);
									return;
								}
								next();
							});
						},
					})),
				],
			},
		}),
	],
});
