import { readD1Migrations as readD1MigrationsFromOptions } from "@cloudflare/workers-utils";
import type { D1Migration } from "../shared/d1";

// Declared here so the plugin's public types don't depend on workers-utils,
// which is bundled. Passing them to the shared function keeps them in sync.
export type ReadD1MigrationsOptions = {
	projectPath?: string;
	migrationsDir?: string;
	migrationsPattern?: string;
};

/**
 * Reads D1 migration files, ordered by migration number. Each migration has
 * its contents split into an array of SQL queries.
 *
 * Pass a directory path to keep the historical behaviour of reading top-level
 * `*.sql` files in that directory. Pass options to discover files the same way
 * Wrangler does, including nested layouts such as
 * `0001_init/migration.sql` via `migrationsPattern`.
 */
export async function readD1Migrations(
	migrationsPathOrOptions: string | ReadD1MigrationsOptions
): Promise<D1Migration[]> {
	if (typeof migrationsPathOrOptions === "string") {
		return readD1MigrationsFromOptions({
			projectPath: migrationsPathOrOptions,
			migrationsDir: ".",
			migrationsPattern: "*.sql",
		});
	}

	if (
		migrationsPathOrOptions !== null &&
		typeof migrationsPathOrOptions === "object"
	) {
		return readD1MigrationsFromOptions(migrationsPathOrOptions);
	}

	throw new TypeError(
		"Failed to execute 'readD1Migrations': parameter 1 is not of type 'string' or 'object'."
	);
}

export type { D1Migration };
