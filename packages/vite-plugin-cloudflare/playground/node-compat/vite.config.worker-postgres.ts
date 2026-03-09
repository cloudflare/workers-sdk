import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/worker-postgres",
	},
	plugins: [
		cloudflare({
			configPath: "./worker-postgres/wrangler.jsonc",
			// Inject the mock Postgres server port set by serve.ts preServe()
			config: () => {
				// eslint-disable-next-line turbo/no-undeclared-env-vars
				const mockPgPort = process.env.MOCK_PG_PORT;
				if (mockPgPort) {
					return {
						vars: {
							DB_HOSTNAME: "127.0.0.1",
							DB_PORT: mockPgPort,
						},
					};
				}
				return {};
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
