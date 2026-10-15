import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

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
				return {
					name: "worker",
					entrypoint: "./worker-postgres/index.ts",
					compatibilityDate: "2024-12-30",
					compatibilityFlags: ["nodejs_compat"],
					env: {
						DB_HOSTNAME: { type: "text", value: "127.0.0.1" },
						DB_PORT: { type: "text", value: mockPgPort ?? "5432" },
						DB_NAME: { type: "text", value: "testdb" },
						DB_USERNAME: { type: "text", value: "testuser" },
						DB_PASSWORD: { type: "text", value: "testpassword" },
					},
				};
			},
			inspectorPort: false,
			persistState: false,
		}),
	],
});
