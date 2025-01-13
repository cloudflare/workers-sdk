import path from "path";
import { configFileName, withConfig } from "../../config";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { printWranglerBanner } from "../../wrangler-banner";
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
				`Couldn't find a D1 DB with the name or binding '${database}' in your ${configFileName(config.configPath)} file.`
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
		).map((migration) => {
			return {
				Name: migration,
			};
		});

		if (unappliedMigrations.length === 0) {
			logger.log("✅ No migrations to apply!");
			return;
		}
		logger.log("Migrations to be applied:");
		logger.table(unappliedMigrations.map((m) => ({ Name: m.Name })));
	}
);
