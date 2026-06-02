import * as fs from "node:fs";
import * as path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	compareMigrationPaths,
	getMigrationNames,
	getNextMigrationNumber,
	maybeLogHint,
	resolveMigrationsConfig,
} from "../../../d1/migrations/helpers";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { MigrationsConfig } from "../../../d1/migrations/helpers";
import type { Database } from "../../../d1/types";

/**
 * Write a set of project files to the current working directory.
 *
 * Each path is interpreted as relative to where `wrangler.toml` would live
 * (i.e. the project root — which `runInTempDir` makes the current working
 * directory). This mirrors the way `migrations_pattern` globs are resolved at
 * runtime, so the tests below read very close to what a user would write.
 *
 * For example: `seedProjectFiles(["migrations/0001_init.sql"])` puts an empty
 * SQL file at `<tempdir>/migrations/0001_init.sql`.
 */
function seedProjectFiles(filesRelativeToProject: string[]) {
	for (const file of filesRelativeToProject) {
		const abs = path.resolve(file);
		fs.mkdirSync(path.dirname(abs), { recursive: true });
		fs.writeFileSync(abs, "-- test migration");
	}
}

/**
 * Build a `MigrationsConfig` for tests. The defaults match what
 * `resolveMigrationsConfig` would produce for a wrangler.jsonc at the
 * project root with `migrations_dir: "migrations"` and no
 * `migrations_pattern`. Tests pass the result straight to
 * `getMigrationNames` / `getNextMigrationNumber`.
 */
function migrationsConfig(
	props: Partial<MigrationsConfig> = {}
): MigrationsConfig {
	return {
		projectPath: ".",
		configFile: "wrangler.jsonc",
		migrationsDir: "migrations",
		migrationsPattern: "migrations/*.sql",
		migrationsTableName: "d1_migrations",
		...props,
	};
}

describe("getMigrationNames", () => {
	runInTempDir();
	// `getMigrationNames` never logs — the drizzle hint comes from
	// `maybeLogHint` (tested separately). Swallow console output anyway.
	mockConsoleMethods();

	it("returns an empty array for an empty directory", ({ expect }) => {
		fs.mkdirSync("migrations", { recursive: true });
		const result = getMigrationNames(migrationsConfig());
		expect(result).toEqual([]);
	});

	it("returns top-level .sql files sorted lexicographically with the default pattern", ({
		expect,
	}) => {
		seedProjectFiles([
			"migrations/0003_add_indexes.sql",
			"migrations/0001_create_tables.sql",
			"migrations/0002_add_columns.sql",
			"migrations/0005_update_views.sql",
			"migrations/0004_drop_unused.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual([
			"0001_create_tables.sql",
			"0002_add_columns.sql",
			"0003_add_indexes.sql",
			"0004_drop_unused.sql",
			"0005_update_views.sql",
		]);
	});

	it("ignores non-SQL files under the default pattern", ({ expect }) => {
		// `migrations_pattern` does the filtering — the walk picks up
		// everything under `migrations_dir`, then minimatch rejects files
		// that don't match. So `README.md`, `config.json`, etc. living
		// alongside the migrations are invisible under the default
		// `migrations/*.sql` pattern without anyone needing to know about
		// them ahead of time.
		seedProjectFiles([
			"migrations/0001_create_tables.sql",
			"migrations/0002_add_columns.sql",
			"migrations/README.md",
			"migrations/config.json",
			"migrations/migration_lock.toml",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual(["0001_create_tables.sql", "0002_add_columns.sql"]);
	});

	it("does not pick up nested .sql files with the default pattern", ({
		expect,
	}) => {
		seedProjectFiles([
			"migrations/0001_create_tables.sql",
			"migrations/test_data/destroy.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		// Top-level file is included; nested is not.
		expect(result).toEqual(["0001_create_tables.sql"]);
	});

	it("picks up nested .sql files when migrations_pattern is configured", ({
		expect,
	}) => {
		seedProjectFiles([
			"migrations/0000_init/migration.sql",
			"migrations/0001_users/migration.sql",
		]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/*/migration.sql" })
		);

		expect(result).toEqual([
			"0000_init/migration.sql",
			"0001_users/migration.sql",
		]);
	});

	it("matches files by whatever extension `migrations_pattern` specifies, not just `.sql`", ({
		expect,
	}) => {
		// The walk doesn't filter by extension — `migrations_pattern` decides
		// what counts as a migration. A user whose ORM emits `.up.sql` files
		// (or anything else) can write the matching pattern and have those
		// picked up. Top-level `.sql` files that don't match the pattern are
		// invisible.
		seedProjectFiles([
			"migrations/0001_init.up.sql",
			"migrations/0002_users.up.sql",
			"migrations/0099_legacy.sql",
		]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/*.up.sql" })
		);

		expect(result).toEqual(["0001_init.up.sql", "0002_users.up.sql"]);
	});

	it("returns names relative to migrations_dir even when the pattern has a literal sub-segment between migrations_dir and the first glob", ({
		expect,
	}) => {
		// A pattern like `migrations/sub/*.sql` adds a literal `sub/`
		// segment between `migrations_dir` and the first glob. The recorded
		// names must still be relative to `migrations_dir` (not relative to
		// `migrations/sub`), so the `d1_migrations` table records
		// `sub/0001_x.sql` — which is what the user can reason about.
		seedProjectFiles([
			"migrations/sub/0001_x.sql",
			"migrations/sub/0002_y.sql",
			// Top-level .sql files must NOT match this pattern.
			"migrations/should_be_ignored.sql",
		]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/sub/*.sql" })
		);

		expect(result).toEqual(["sub/0001_x.sql", "sub/0002_y.sql"]);
	});

	it("recursively finds .sql files 3 levels deep when migrations_pattern uses **", ({
		expect,
	}) => {
		seedProjectFiles([
			// One file at each of levels 1, 2, and 3 under migrations_dir.
			"migrations/0001_top.sql",
			"migrations/feature_a/0002_mid.sql",
			"migrations/feature_b/sub/0003_deep.sql",
		]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/**/*.sql" })
		);

		expect(result).toEqual([
			"0001_top.sql",
			"feature_a/0002_mid.sql",
			"feature_b/sub/0003_deep.sql",
		]);
	});

	it("ignores nested .sql files that the configured pattern can't reach", ({
		expect,
	}) => {
		// A nested file under a flat `migrations/*.sql` pattern is not a
		// migration. (Whether this should print a drizzle hint is
		// `maybeLogHint`'s job, tested separately — `getMigrationNames`
		// itself never logs.)
		seedProjectFiles(["migrations/test_data/destroy.sql"]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/*.sql" })
		);

		expect(result).toEqual([]);
	});

	it("does not descend into subdirectories the configured pattern cannot reach", ({
		expect,
	}) => {
		// Imagine the user has somehow ended up with a `node_modules` inside
		// their migrations dir. Walking it would be expensive and pointless,
		// because the default pattern `migrations/*.sql` only matches
		// top-level files. The walker should prune `node_modules/` before
		// descending into it. We observe the effect: a file deep under
		// `node_modules/` is not reported.
		seedProjectFiles([
			"migrations/0001_real.sql",
			"migrations/node_modules/some_pkg/0001/migration.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		// The configured pattern matches only the top-level file.
		expect(result).toEqual(["0001_real.sql"]);
	});

	it("descends arbitrarily deep when migrations_pattern uses `**`", ({
		expect,
	}) => {
		// The flip side of the prune test above: when the user has opted
		// into a globstar pattern, the walker must NOT prune. The user has
		// explicitly asked for "search everything under migrations_dir", so
		// even a `node_modules/`-style nested tree should be visited.
		seedProjectFiles(["migrations/very/deeply/nested/0001_init.sql"]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/**/*.sql" })
		);

		expect(result).toEqual(["very/deeply/nested/0001_init.sql"]);
	});

	it("works end-to-end when migrations_dir / migrations_pattern are absolute Windows-style backslash paths", ({
		expect,
	}) => {
		// `runInTempDir()` makes cwd a fresh temp dir; `path.resolve` gives its
		// absolute path. We convert the separators to backslashes to mirror a
		// user who wrote a Windows-style absolute path
		// (`C:\Users\…\migrations`) in their config.
		// On Mac/Linux it's \Users\…\migrations and on Windows it's C:\…\migrations.
		// This happens not to break anything on mac.
		const absMigrationsDir = path.resolve("migrations").replace(/\//g, "\\");
		seedProjectFiles([
			"migrations/0001_init/migration.sql",
			"migrations/0002_users/migration.sql",
		]);

		// Build the config the way production does — through
		// resolveMigrationsConfig — so the backslashes are normalized before
		// getMigrationNames walks the tree.
		const config = resolveMigrationsConfig({
			databaseInfo: {
				uuid: "x",
				binding: "DB",
				migrationsTableName: "d1_migrations",
				migrationsDirRaw: absMigrationsDir,
				migrationsPattern: `${absMigrationsDir}\\*\\migration.sql`,
			},
			// An unrelated project dir: because migrations_dir is absolute, it
			// is ignored when resolving the walk root.
			configPath: path.join("some", "other", "place", "wrangler.jsonc"),
		});

		const result = getMigrationNames(config);

		// Names are recorded relative to migrations_dir, so the d1_migrations
		// table records the same name regardless of how the user wrote the path.
		expect(result).toEqual([
			"0001_init/migration.sql",
			"0002_users/migration.sql",
		]);
	});
});

describe("maybeLogHint", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("logs an actionable hint when nested files match `*/migration.sql` (drizzle layout) but the configured pattern finds nothing", ({
		expect,
	}) => {
		seedProjectFiles([
			"migrations/0000_init/migration.sql",
			"migrations/0001_users/migration.sql",
		]);

		maybeLogHint(
			migrationsConfig({
				migrationsPattern: "migrations/*.sql",
			})
		);

		// Lock in the full warning so we can eyeball that it's actionable —
		// it identifies the layout, says exactly what to set, and names the
		// config file.
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mCould not find any migration files matching \`migrations/*.sql\`. It looks like there are migration files matching \`migrations/*/migration.sql\` though. If you are using drizzle to manage your migrations, please set \`migrations_pattern\` to \`migrations/*/migration.sql\` in wrangler.jsonc.[0m

			"
		`);
	});

	it("does not log a hint for nested .sql files that aren't named `migration.sql`", ({
		expect,
	}) => {
		// Drizzle's layout is specifically `<numbered_folder>/migration.sql`.
		// A nested file with any other name (here `destroy.sql`) is not the
		// drizzle layout, so no hint — the user may have intentionally placed
		// a test-data dump or similar under their migrations_dir.
		seedProjectFiles(["migrations/test_data/destroy.sql"]);

		maybeLogHint(migrationsConfig({ migrationsPattern: "migrations/*.sql" }));

		expect(std.warn).toBe("");
	});

	it("does not log a hint when there are no nested files at all", ({
		expect,
	}) => {
		// Only top-level files (which the default pattern would have matched
		// anyway). Nothing looks like the drizzle layout, so no hint.
		seedProjectFiles(["migrations/0001_init.sql"]);

		maybeLogHint(migrationsConfig({ migrationsPattern: "migrations/*.sql" }));

		expect(std.warn).toBe("");
	});
});

// These tests pin down the ordering contract of `getMigrationNames`. The
// rule is: sort by the integer at the start of the first path segment, then
// by full relative path lexicographically as a tiebreaker. This preserves the
// ordering the old explicit numeric-prefix comparator in apply.ts produced,
// while also being deterministic in the cases the old comparator left
// unsorted (same prefix, no prefix at all) and supporting nested layouts.
describe("getMigrationNames ordering", () => {
	runInTempDir();
	mockConsoleMethods();

	it("sorts zero-padded migrations in numeric order", ({ expect }) => {
		// `wrangler d1 migrations create` produces 4-digit-padded prefixes.
		// This is the common case and must work.
		seedProjectFiles([
			"migrations/0010_j.sql",
			"migrations/0002_b.sql",
			"migrations/0001_a.sql",
			"migrations/0100_h.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual([
			"0001_a.sql",
			"0002_b.sql",
			"0010_j.sql",
			"0100_h.sql",
		]);
	});

	it("sorts inconsistently-padded numeric prefixes in numeric order, NOT lexicographic", ({
		expect,
	}) => {
		// A user with hand-written migrations `1_a.sql`, `9_b.sql`,
		// `10_c.sql` expects them to run in numeric order [1, 9, 10] — not
		// lexicographic order [10, 1, 9], which would interleave them.
		//
		// This is the case where the old explicit numeric-prefix comparator
		// in apply.ts mattered: without it, a default `Array.sort()` would
		// re-order existing users' migrations. We can't break that.
		seedProjectFiles([
			"migrations/1_a.sql",
			"migrations/9_b.sql",
			"migrations/10_c.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual(["1_a.sql", "9_b.sql", "10_c.sql"]);
	});

	it("gives a deterministic order for files with the same numeric prefix (the old comparator returned 0)", ({
		expect,
	}) => {
		// The old comparator returned 0 for any two files with the same
		// numeric prefix, leaving their relative order up to whatever the
		// caller passed in. Lex tiebreak makes this deterministic.
		seedProjectFiles([
			"migrations/0001_beta.sql",
			"migrations/0001_alpha.sql",
			"migrations/0001_gamma.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual([
			"0001_alpha.sql",
			"0001_beta.sql",
			"0001_gamma.sql",
		]);
	});

	it("gives a deterministic order for files without a numeric prefix (the old comparator returned 0)", ({
		expect,
	}) => {
		// `parseInt("init")` is `NaN`. The old comparator returned 0 for any
		// pair with NaN parses; the new comparator falls back to lex order on
		// the full relative path so ordering is deterministic.
		seedProjectFiles([
			"migrations/migrate.sql",
			"migrations/init.sql",
			"migrations/seed.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual(["init.sql", "migrate.sql", "seed.sql"]);
	});

	it("puts numbered files before unnumbered files", ({ expect }) => {
		// If a project mixes both styles, run the numbered migrations first
		// (the user clearly knew about numeric ordering) and the unnumbered
		// ones after, in alphabetical order.
		seedProjectFiles([
			"migrations/setup.sql",
			"migrations/0002_users.sql",
			"migrations/cleanup.sql",
			"migrations/0001_init.sql",
		]);

		const result = getMigrationNames(migrationsConfig());

		expect(result).toEqual([
			"0001_init.sql",
			"0002_users.sql",
			"cleanup.sql",
			"setup.sql",
		]);
	});

	it("uses the directory's numeric prefix for nested drizzle-style layouts", ({
		expect,
	}) => {
		// For `0001_a/migration.sql`, the number comes from the directory
		// (`0001_a`), not the filename (`migration.sql`). That way users with
		// inconsistently-padded directory numbers get the same numeric
		// ordering they would for a flat layout.
		seedProjectFiles([
			"migrations/10_c/migration.sql",
			"migrations/2_b/migration.sql",
			"migrations/1_a/migration.sql",
		]);

		const result = getMigrationNames(
			migrationsConfig({ migrationsPattern: "migrations/*/migration.sql" })
		);

		expect(result).toEqual([
			"1_a/migration.sql",
			"2_b/migration.sql",
			"10_c/migration.sql",
		]);
	});
});

describe("compareMigrationPaths", () => {
	it("orders numbered files inside a shared numbered directory numerically", ({
		expect,
	}) => {
		const unsorted = [
			"0001_posts/10_c.sql",
			"0001_posts/1_a.sql",
			"0001_posts/9_b.sql",
		];

		expect([...unsorted].sort(compareMigrationPaths)).toEqual([
			"0001_posts/1_a.sql",
			"0001_posts/9_b.sql",
			"0001_posts/10_c.sql",
		]);
	});
});

describe("getNextMigrationNumber", () => {
	runInTempDir();
	// We don't assert on the hint output here, but `getMigrationNames` will
	// log one when the configured pattern finds nothing but a drizzle-style
	// layout exists — capture it so it doesn't pollute the test runner.
	mockConsoleMethods();

	it("returns 1 for an empty directory", ({ expect }) => {
		fs.mkdirSync("migrations", { recursive: true });
		expect(getNextMigrationNumber(migrationsConfig())).toEqual(1);
	});

	it("returns highest top-level number + 1 for flat layouts (default pattern)", ({
		expect,
	}) => {
		seedProjectFiles([
			"migrations/0001_create.sql",
			"migrations/0002_users.sql",
		]);
		expect(getNextMigrationNumber(migrationsConfig())).toEqual(3);
	});

	it("counts numbered directories the same as numbered files when the pattern matches both", ({
		expect,
	}) => {
		// Mixed flat and nested layout, pattern matches both. `0099_nested/`
		// contributes 99 to the set (the directory carries the number), so
		// the next migration should be 100.
		seedProjectFiles([
			"migrations/0001_create.sql",
			"migrations/0002_users.sql",
			"migrations/0099_nested/migration.sql",
		]);
		expect(
			getNextMigrationNumber(
				migrationsConfig({ migrationsPattern: "migrations/**/*.sql" })
			)
		).toEqual(100);
	});

	it("ignores files in unnumbered subdirectories (default pattern)", ({
		expect,
	}) => {
		// Default pattern is `migrations/*.sql`, so the nested file under
		// `test_data/` doesn't participate at all.
		seedProjectFiles([
			"migrations/0001_create.sql",
			"migrations/README.md",
			"migrations/test_data/destroy.sql",
		]);
		expect(getNextMigrationNumber(migrationsConfig())).toEqual(2);
	});

	it("collapses multiple files inside a single numbered directory to one number", ({
		expect,
	}) => {
		// `0001_init/` is a single migration (the directory itself); even
		// though there are three `.sql` files inside, they all live under
		// the same numbered directory, so the highest number is 1 and the
		// next is 2 — not 100.
		seedProjectFiles([
			"migrations/0001_init/01.sql",
			"migrations/0001_init/02.sql",
			"migrations/0001_init/99.sql",
		]);
		expect(
			getNextMigrationNumber(
				migrationsConfig({ migrationsPattern: "migrations/**/*.sql" })
			)
		).toEqual(2);
	});

	// --- Pattern-aware semantics ---

	it("uses only files that match `migrations_pattern` — top-level files are invisible under a nested-only pattern", ({
		expect,
	}) => {
		// User has switched to a drizzle-style nested pattern but a stale
		// top-level file is sitting in the dir. That file would not be
		// applied (pattern doesn't match it), so it shouldn't influence
		// numbering either.
		seedProjectFiles([
			"migrations/0099_stale_topfile.sql",
			"migrations/0001_init/migration.sql",
			"migrations/0002_users/migration.sql",
		]);
		expect(
			getNextMigrationNumber(
				migrationsConfig({ migrationsPattern: "migrations/*/migration.sql" })
			)
		).toEqual(3);
	});

	it("uses only files that match `migrations_pattern` — nested files are invisible under a flat-only pattern", ({
		expect,
	}) => {
		// Mirror of the above. Drizzle-style files exist on disk but the
		// configured pattern only matches top-level, so the nested ones
		// don't contribute to numbering.
		seedProjectFiles([
			"migrations/0001_create.sql",
			"migrations/0099_drizzle/migration.sql",
		]);
		expect(
			getNextMigrationNumber(
				migrationsConfig({ migrationsPattern: "migrations/*.sql" })
			)
		).toEqual(2);
	});

	it("returns 1 when `migrations_pattern` matches nothing at all", ({
		expect,
	}) => {
		// User has migrations in nested directories but their pattern is
		// the default `migrations/*.sql`. `getNextMigrationNumber` sees no
		// matched files, so the next number is 1. (`getMigrationNames`
		// will also log a drizzle hint here, captured by mockConsoleMethods.)
		seedProjectFiles([
			"migrations/0001_init/migration.sql",
			"migrations/0002_users/migration.sql",
		]);
		expect(getNextMigrationNumber(migrationsConfig())).toEqual(1);
	});
});

describe("resolveMigrationsConfig", () => {
	// Pure syntactic check — no filesystem involved. Each test reads as
	// "given this `migrations_pattern` and `migrations_dir` from the user's
	// config, does the helper accept or reject it?"

	/**
	 * Build a minimal `Database` for tests. Defaults give a binding with no
	 * `migrations_dir` / `migrations_pattern` set; overrides go in `props`.
	 */
	function databaseInfo(props: Partial<Database> = {}): Database {
		return {
			uuid: "x",
			binding: "DB",
			migrationsTableName: "d1_migrations",
			...props,
		};
	}

	// --- No-op cases ---

	it("is a no-op when migrations_pattern is not set", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo(),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("is a no-op when migrations_pattern is not set even if migrations_dir is", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	// --- Accepted configurations ---

	it("accepts pattern that literally starts with migrations_dir", ({
		expect,
	}) => {
		const result = resolveMigrationsConfig({
			databaseInfo: databaseInfo({
				migrationsDirRaw: "migrations",
				migrationsPattern: "migrations/*.sql",
			}),
			configPath: "wrangler.jsonc",
		});
		expect(result.migrationsPattern).toBe("migrations/*.sql");
	});

	it("accepts nested drizzle-style pattern", ({ expect }) => {
		const result = resolveMigrationsConfig({
			databaseInfo: databaseInfo({
				migrationsDirRaw: "migrations",
				migrationsPattern: "migrations/*/migration.sql",
			}),
			configPath: "wrangler.jsonc",
		});
		expect(result.migrationsPattern).toBe("migrations/*/migration.sql");
	});

	it("accepts deeply nested pattern with deeply nested dir", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "db/migrations",
					migrationsPattern: "db/migrations/**/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("normalises `./` prefix on migrations_dir before comparing", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "./migrations",
					migrationsPattern: "migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("normalises trailing `/` on migrations_dir before comparing", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations/",
					migrationsPattern: "migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("normalises `./` prefix on migrations_pattern before comparing", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "./migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("normalises a Windows drive-letter path with backslashes", ({
		expect,
	}) => {
		// A user on Windows may write an absolute, backslashed path in their
		// config. `normalizeRelativePath` flips the backslashes to forward
		// slashes (on every platform, so this test isn't Windows-gated) and
		// the drive letter survives, so the dir and pattern line up and the
		// resolved config carries forward-slash paths. This is the layer where
		// backslashes are handled — `getMigrationNames` only ever sees the
		// normalized result. (The end-to-end Windows walk is covered by the
		// Windows-only test in the `getMigrationNames` block.)
		const result = resolveMigrationsConfig({
			databaseInfo: databaseInfo({
				migrationsDirRaw: "C:\\some\\windows\\path",
				migrationsPattern: "C:\\some\\windows\\path\\*\\migration.sql",
			}),
			configPath: "wrangler.jsonc",
		});
		expect(result.migrationsDir).toBe("C:/some/windows/path");
		expect(result.migrationsPattern).toBe(
			"C:/some/windows/path/*/migration.sql"
		);
		// The pattern stays under the dir, so getMigrationNames can strip the
		// prefix to walk relative to it.
		expect(
			result.migrationsPattern.startsWith(`${result.migrationsDir}/`)
		).toBe(true);
	});

	it('accepts `migrations_dir: "."` with a pattern rooted at the project root', ({
		expect,
	}) => {
		// A user can treat the project root itself as the migrations dir by
		// setting `migrations_dir: "."`. Both `.` and `./` normalize to `.`,
		// and a pattern like `./*.sql` normalizes to `*.sql`. The two are
		// consistent — the pattern targets files directly inside the dir —
		// so this should be accepted, not rejected by the "starts with"
		// check.
		const result = resolveMigrationsConfig({
			databaseInfo: databaseInfo({
				migrationsDirRaw: ".",
				migrationsPattern: "./*.sql",
			}),
			configPath: "wrangler.jsonc",
		});
		expect(result.migrationsDir).toBe(".");
		expect(result.migrationsPattern).toBe("*.sql");
	});

	// --- Rejected: migrations_pattern set without migrations_dir ---

	it("rejects migrations_pattern set without an explicit migrations_dir, with an actionable hint", ({
		expect,
	}) => {
		const call = () =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: undefined,
					migrationsPattern: "migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			});
		expect(call).toThrow(/have not set `migrations_dir`/);
		// The error should also tell the user how to fix it (add a
		// migrations_dir entry, with a worked example).
		expect(call).toThrow(
			/Add a `migrations_dir` entry.*`"migrations_dir": "migrations"`/s
		);
	});

	// --- Rejected: pattern doesn't start with dir ---

	it("rejects pattern with wrong literal prefix, with an actionable hint", ({
		expect,
	}) => {
		const call = () =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "schema/*.sql",
				}),
				configPath: "wrangler.jsonc",
			});
		expect(call).toThrow(/must start with `migrations\/`/);
		// The error should also tell the user the actionable fix: change
		// migrations_pattern to start with the dir (with a worked example).
		expect(call).toThrow(
			/change `migrations_pattern`.*`"migrations\/\*\.sql"`/s
		);
	});

	it("rejects a top-level `*.sql` pattern when dir is a subdirectory", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `migrations\/`/);
	});

	it("rejects a globstar-prefix pattern (must start with the literal dir)", ({
		expect,
	}) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "**/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `migrations\/`/);
	});

	it("rejects a pattern that only partially overlaps the dir name", ({
		expect,
	}) => {
		// "migrations" is a prefix of "migrationsfoo" as a *string*, but not as
		// a *path segment*. The check requires the trailing `/` to avoid
		// matching `migrations_foo/x.sql` as "starts with `migrations`".
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "migrationsfoo/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `migrations\/`/);
	});

	// --- Absolute paths ---

	it("accepts matching absolute paths", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "/abs/migrations",
					migrationsPattern: "/abs/migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("rejects mismatched absolute paths", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "/abs/migrations",
					migrationsPattern: "/abs/other/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `\/abs\/migrations\/`/);
	});

	it("rejects mixing absolute dir with relative pattern", ({ expect }) => {
		// The pattern must literally start with the (normalized) dir, so a
		// relative pattern can't satisfy an absolute dir.
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "/abs/migrations",
					migrationsPattern: "migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `\/abs\/migrations\/`/);
	});

	it("rejects mixing relative dir with absolute pattern", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "migrations",
					migrationsPattern: "/abs/migrations/*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `migrations\/`/);
	});

	// --- Windows-style absolute paths (drive letters + backslashes) ---

	it("accepts Windows-style absolute paths with backslashes", ({ expect }) => {
		// normalizeRelativePath flips `\` to `/` before comparing, so a user
		// writing `C:\…\migrations` as a config value (which is natural on
		// Windows) is accepted when the pattern uses the same prefix.
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "C:\\Users\\Dave\\proj\\migrations",
					migrationsPattern: "C:\\Users\\Dave\\proj\\migrations\\*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("accepts a Windows-style dir with a forward-slash pattern (typical config)", ({
		expect,
	}) => {
		// A user might write the dir in their config in the OS-native form
		// (`C:\…\migrations`) while writing the pattern as a glob with
		// forward slashes (which minimatch wants). Both normalize to the
		// same form.
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "C:\\Users\\Dave\\proj\\migrations",
					migrationsPattern: "C:/Users/Dave/proj/migrations/*/migration.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).not.toThrow();
	});

	it("rejects mismatched Windows-style absolute paths", ({ expect }) => {
		expect(() =>
			resolveMigrationsConfig({
				databaseInfo: databaseInfo({
					migrationsDirRaw: "C:\\Users\\Dave\\proj\\migrations",
					migrationsPattern: "C:\\Users\\Dave\\proj\\other\\*.sql",
				}),
				configPath: "wrangler.jsonc",
			})
		).toThrow(/must start with `C:\/Users\/Dave\/proj\/migrations\/`/);
	});
});
