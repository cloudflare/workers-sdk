import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return {
		plugins: [
			cloudflareTest({
				wrangler: {
					configPath: "./wrangler.jsonc",
					environment: "production",
				},
				miniflare: {
					// Add a test-only binding for migrations, so we can apply them in a
					// setup file
					bindings: { TEST_MIGRATIONS: migrations },
				},
			}),
		],
		test: {
			setupFiles: ["./test/apply-migrations.ts"],
		},
	};
});
