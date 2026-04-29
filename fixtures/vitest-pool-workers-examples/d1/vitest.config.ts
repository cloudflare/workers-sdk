import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig, defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default defineConfig(async () => {
	// Read all migrations in the `migrations` directory
	const migrationsPath = path.join(__dirname, "migrations");
	const migrations = await readD1Migrations(migrationsPath);

	return mergeConfig(
		configShared,
		defineProject({
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
		})
	);
});
