import path from "path";
import { Box, Text } from "ink";
import Table from "ink-table";
import { printWranglerBanner } from "../..";
import { withConfig } from "../../config";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { renderToString } from "../../utils/render";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { getDatabaseInfoFromConfig } from "../utils";
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
	async ({
		config,
		database,
		local,
		remote,
		persistTo,
		preview,
	}): Promise<void> => {
		await printWranglerBanner();
		if (remote) {
			await requireAuth({});
		}

		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo && remote) {
			throw new UserError(
				`Couldn't find a D1 DB with the name or binding '${database}' in wrangler.toml.`
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
