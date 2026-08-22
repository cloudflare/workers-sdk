import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { workerPostgresConfig } from "./worker-configs";

export default defineConfig({
	build: {
		outDir: "dist/worker-postgres",
	},
	plugins: [
		cloudflare({
			types: { includeRuntime: false },
			// Inject the mock Postgres server port set by serve.ts preServe()
			config: () => {
				// eslint-disable-next-line turbo/no-undeclared-env-vars -- internal to the test process: set by serve.ts preServe(), not an external input
				const mockPgPort = process.env.MOCK_PG_PORT;
				if (mockPgPort) {
					return {
						...workerPostgresConfig,
						env: {
							...workerPostgresConfig.env,
							DB_PORT: { type: "text", value: mockPgPort },
						},
					};
				}
				return workerPostgresConfig;
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
