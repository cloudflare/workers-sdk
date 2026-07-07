import { configFileName, UserError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { isNonInteractiveOrCI } from "../../is-interactive";
import { logger } from "../../logger";
import { executeSql } from "../execute";
import { getDatabaseInfoFromConfig } from "../utils";
import {
	buildMigrationQuery,
	getMigrationsPath,
	getUnappliedMigrations,
	initMigrationsTable,
	resolveMigrationsConfig,
} from "./helpers";
import type { ParseError } from "@cloudflare/workers-utils";

export const d1MigrationsApplyCommand = createCommand({
	metadata: {
		description: "Apply any unapplied D1 migrations",
		epilogue: dedent`
			This command will prompt you to confirm the migrations you are about to apply.
			Confirm that you would like to proceed. After applying, a backup will be captured.

			The progress of each migration will be printed in the console.

			When running the apply command in a CI/CD environment or another non-interactive
			command line, the confirmation step will be skipped, but the backup will still be
			captured.

			If applying a migration results in an error, this migration will be rolled back,
			and the previous successful migration will remain applied.
		`,
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		supportTemporary: true,
		printResourceLocation: true,
	},
	args: {
		database: {
			type: "string",
			demandOption: true,
			description: "The name or binding of the DB",
		},
		local: {
			type: "boolean",
			description:
				"Execute commands/files against a local DB for use with wrangler dev",
		},
		remote: {
			type: "boolean",
			description:
				"Execute commands/files against a remote DB for use with wrangler dev --remote",
		},
		preview: {
			type: "boolean",
			description: "Execute commands/files against a preview D1 DB",
			default: false,
		},
		"persist-to": {
			type: "string",
			description:
				"Specify directory to use for local persistence (you must use --local with this flag)",
			requiresArg: true,
		},
	},
	positionalArgs: ["database"],
	async handler({ database, local, remote, persistTo, preview }, { config }) {
		if (!config.configPath) {
			throw new UserError(
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database.",
				{ telemetryMessage: "d1 migrations apply missing config file" }
			);
		}

		const databaseInfo = getDatabaseInfoFromConfig(config, database);

		if (!databaseInfo && remote) {
			throw new UserError(
				`Couldn't find a D1 DB with the name or binding '${database}' in your ${configFileName(config.configPath)} file.`,
				{
					telemetryMessage: "d1 migrations apply database not found in config",
				}
			);
		}

		const migrationsConfig = resolveMigrationsConfig({
			databaseInfo: databaseInfo ?? null,
			configPath: config.configPath,
		});
		const migrationsPath = await getMigrationsPath({
			projectPath: migrationsConfig.projectPath,
			migrationsDir: migrationsConfig.migrationsDir,
			migrationsDirRaw: migrationsConfig.migrationsDirRaw,
			createIfMissing: false,
			configPath: config.configPath,
		});

		await initMigrationsTable({
			migrationsTableName: migrationsConfig.migrationsTableName,
			local,
			remote,
			config,
			name: database,
			persistTo,
			preview,
		});

		// `getUnappliedMigrations` returns paths already sorted by
		// `compareMigrationPaths` in helpers.ts: numeric order on the first
		// path segment's leading integer (matching the comparator this code
		// used to do inline), with a lex tiebreaker for files that share a
		// numeric prefix or have none.
		const unappliedMigrations = (
			await getUnappliedMigrations({
				migrationsConfig,
				local,
				remote,
				config,
				name: database,
				persistTo,
				preview,
			})
		).map((migration) => {
			return {
				name: migration,
				status: "🕒️",
			};
		});

		if (unappliedMigrations.length === 0) {
			logger.log("✅ No migrations to apply!");
			return;
		}
		logger.log("Migrations to be applied:");
		logger.table(unappliedMigrations.map((m) => ({ name: m.name })));

		const ok = await confirm(
			`About to apply ${unappliedMigrations.length} migration(s)
Your database may not be available to serve requests during the migration, continue?`
		);
		if (!ok) {
			return;
		}

		for (const migration of unappliedMigrations) {
			const query = buildMigrationQuery({
				migrationName: migration.name,
				migrationsPath,
				migrationsTableName: migrationsConfig.migrationsTableName,
			});

			let success = true;
			let errorNotes: Array<string> = [];
			try {
				const response = await executeSql({
					local,
					remote,
					config,
					name: database,
					shouldPrompt: !isNonInteractiveOrCI(),
					persistTo,
					command: query,
					file: undefined,
					json: undefined,
					preview,
				});

				if (response === null) {
					throw new UserError(
						`Migration "${migration.name}" was not applied — execution was cancelled.`,
						{ telemetryMessage: "d1 migrations apply execution cancelled" }
					);
				}

				for (const result of response) {
					// When executing more than 1 statement, response turns into an array of QueryResult
					if (Array.isArray(result)) {
						for (const subResult of result) {
							if (!subResult.success) {
								success = false;
							}
						}
					} else {
						if (!result.success) {
							success = false;
						}
					}
				}
			} catch (e) {
				if (e instanceof UserError) {
					throw e;
				}
				const err = e as ParseError;
				const maybeCause = (err.cause ?? err) as Error;

				success = false;
				errorNotes = err.notes?.map((msg) => msg.text) ?? [
					maybeCause?.message ?? maybeCause.toString(),
				];
			}

			migration.status = success ? "✅" : "❌";

			logger.table(
				unappliedMigrations.map((m) => ({ name: m.name, status: m.status }))
			);
			if (errorNotes.length > 0) {
				logger.error(
					`Migration ${migration.name} failed with the following errors:`
				);
			}

			if (errorNotes.length > 0) {
				throw new UserError(
					errorNotes
						.map((err) => {
							return err;
						})
						.join("\n"),
					{ telemetryMessage: "d1 migrations apply migration failed" }
				);
			}
		}
	},
});
