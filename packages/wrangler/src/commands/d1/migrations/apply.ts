import fs from "node:fs";
import path from "node:path";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { isNonInteractiveOrCI } from "../../../is-interactive";
import { logger } from "../../../logger";
import { isLocal } from "../../../utils/is-local";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { executeSql } from "../execute";
import { getDatabaseInfoFromConfig } from "../utils";
import {
	getMigrationsPath,
	getUnappliedMigrations,
	initMigrationsTable,
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
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database."
			);
		}

		const databaseInfo = getDatabaseInfoFromConfig(config, database, {
			requireDatabaseId: !isLocal({ local, remote }),
		});

		if (!databaseInfo && remote) {
			throw new UserError(
				`Couldn't find a D1 DB with the name or binding '${database}' in your ${configFileName(config.configPath)} file.`
			);
		}

		const migrationsPath = await getMigrationsPath({
			projectPath: path.dirname(config.configPath),
			migrationsFolderPath:
				databaseInfo?.migrationsFolderPath ?? DEFAULT_MIGRATION_PATH,
			createIfMissing: false,
			configPath: config.configPath,
		});

		const migrationsTableName =
			databaseInfo?.migrationsTableName ?? DEFAULT_MIGRATION_TABLE;
		await initMigrationsTable({
			migrationsTableName,
			local,
			remote,
			config,
			name: database,
			persistTo,
			preview,
		});

		const unappliedMigrations = (
			await getUnappliedMigrations({
				migrationsTableName,
				migrationsPath,
				local,
				remote,
				config,
				name: database,
				persistTo,
				preview,
			})
		)
			.map((migration) => {
				return {
					name: migration,
					status: "🕒️",
				};
			})
			.sort((a, b) => {
				const migrationNumberA = parseInt(a.name.split("_")[0]);
				const migrationNumberB = parseInt(b.name.split("_")[0]);
				if (migrationNumberA < migrationNumberB) {
					return -1;
				}
				if (migrationNumberA > migrationNumberB) {
					return 1;
				}

				// numbers must be equal
				return 0;
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
			let query = fs.readFileSync(
				`${migrationsPath}/${migration.name}`,
				"utf8"
			);
			query += `
								INSERT INTO ${migrationsTableName} (name)
								values ('${migration.name}');
						`;

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
					// TODO:  return error
					return;
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
						.join("\n")
				);
			}
		}
	},
});
