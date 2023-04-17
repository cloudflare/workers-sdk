import path from "path";
import { Box, Text } from "ink";
import Table from "ink-table";
import React from "react";
import { withConfig } from "../../config";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { renderToString } from "../../utils/render";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { d1BetaWarning, getDatabaseInfoFromConfig } from "../utils";
import {
	getMigrationsPath,
	getUnappliedMigrations,
	initMigrationsTable,
} from "./helpers";
import { MigrationOptions } from "./options";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export function ListOptions(yargs: CommonYargsArgv) {
	return MigrationOptions(yargs);
}

type ListHandlerOptions = StrictYargsOptionsToInterface<typeof ListOptions>;

export const ListHandler = withConfig<ListHandlerOptions>(
	async ({ config, database, local, persistTo, preview }): Promise<void> => {
		if (!local) {
			await requireAuth({});
		}
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
		).map((migration) => {
			return {
				Name: migration,
			};
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
	}
);
