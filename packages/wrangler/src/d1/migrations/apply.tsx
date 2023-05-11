import assert from "node:assert";
import fs from "node:fs";
import path from "path";
import { Box, Text } from "ink";
import Table from "ink-table";
import React from "react";
import { withConfig } from "../../config";
import { confirm } from "../../dialogs";
import { CI } from "../../is-ci";
import isInteractive from "../../is-interactive";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { renderToString } from "../../utils/render";
import { createBackup } from "../backups";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { executeSql } from "../execute";
import { d1BetaWarning, getDatabaseInfoFromConfig } from "../utils";
import {
	getMigrationsPath,
	getUnappliedMigrations,
	initMigrationsTable,
} from "./helpers";
import { MigrationOptions } from "./options";
import type { ParseError } from "../../parse";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export function ApplyOptions(yargs: CommonYargsArgv) {
	return MigrationOptions(yargs);
}

type ApplyHandlerOptions = StrictYargsOptionsToInterface<typeof ApplyOptions>;

export const ApplyHandler = withConfig<ApplyHandlerOptions>(
	async ({ config, database, local, persistTo, preview }): Promise<void> => {
		logger.log(d1BetaWarning);

		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo && !local) {
			throw new Error(
				`Can't find a DB with name/binding '${database}' in local config. Check info in wrangler.toml...`
			);
		}

		if (!config.configPath) {
			return;
		}

		const migrationsPath = await getMigrationsPath({
			projectPath: path.dirname(config.configPath),
			migrationsFolderPath:
				databaseInfo?.migrationsFolderPath ?? DEFAULT_MIGRATION_PATH,
			createIfMissing: false,
		});

		const migrationsTableName =
			databaseInfo?.migrationsTableName ?? DEFAULT_MIGRATION_TABLE;
		await initMigrationsTable({
			migrationsTableName,
			local,
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
				config,
				name: database,
				persistTo,
				preview,
			})
		)
			.map((migration) => {
				return {
					Name: migration,
					Status: "🕒️",
				};
			})
			.sort((a, b) => {
				const migrationNumberA = parseInt(a.Name.split("_")[0]);
				const migrationNumberB = parseInt(b.Name.split("_")[0]);
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
			logger.log(renderToString(<Text>✅ No migrations to apply!</Text>));
			return;
		}
		logger.log(
			renderToString(
				<Box flexDirection="column">
					<Text>Migrations to be applied:</Text>
					<Table data={unappliedMigrations} columns={["Name"]}></Table>
				</Box>
			)
		);
		const ok = await confirm(
			`About to apply ${unappliedMigrations.length} migration(s)
Your database may not be available to serve requests during the migration, continue?`
		);
		if (!ok) return;

		// don't backup prod db when applying migrations locally or in preview
		if (!local && !preview) {
			assert(
				databaseInfo,
				"In non-local mode `databaseInfo` should be defined."
			);
			logger.log(renderToString(<Text>🕒 Creating backup...</Text>));
			const accountId = await requireAuth(config);
			await createBackup(accountId, databaseInfo.uuid);
		}

		for (const migration of unappliedMigrations) {
			let query = fs.readFileSync(
				`${migrationsPath}/${migration.Name}`,
				"utf8"
			);
			query += `
								INSERT INTO ${migrationsTableName} (name)
								values ('${migration.Name}');
						`;

			let success = true;
			let errorNotes: Array<string> = [];
			try {
				const response = await executeSql({
					local,
					config,
					name: database,
					shouldPrompt: isInteractive() && !CI.isCI(),
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

			migration.Status = success ? "✅" : "❌";

			logger.log(
				renderToString(
					<Box flexDirection="column">
						<Table
							data={unappliedMigrations}
							columns={["Name", "Status"]}
						></Table>
						{errorNotes.length > 0 && (
							<Box flexDirection="column">
								<Text>&nbsp;</Text>
								<Text>
									❌ Migration {migration.Name} failed with following Errors
								</Text>
								<Table
									data={errorNotes.map((err) => {
										return { Error: err };
									})}
								></Table>
							</Box>
						)}
					</Box>
				)
			);

			if (errorNotes.length > 0) return;
		}
	}
);
