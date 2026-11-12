import { readD1Migrations as readD1MigrationsShared } from "@cloudflare/workers-utils";
import type { D1Migration } from "../shared/d1";

// The public types are declared here, rather than re-exported, because the
// published declarations can't import from `@cloudflare/workers-utils`, which
// is bundled. Passing them to the shared function keeps them in sync.
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
export function readD1Migrations(
	migrationsPathOrOptions: string | ReadD1MigrationsOptions
): Promise<D1Migration[]> {
	return readD1MigrationsShared(migrationsPathOrOptions);
}

export type { D1Migration };
