import fs from "node:fs";
import path from "path";
import { configFileName, withConfig } from "../../config";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../wrangler-banner";
import { DEFAULT_MIGRATION_PATH } from "../constants";
import { Database } from "../options";
import { getDatabaseInfoFromConfig } from "../utils";
import { getMigrationsPath, getNextMigrationNumber } from "./helpers";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

export function CreateOptions(yargs: CommonYargsArgv) {
	return Database(yargs).positional("message", {
		describe: "The Migration message",
		type: "string",
		demandOption: true,
	});
}

type CreateHandlerOptions = StrictYargsOptionsToInterface<typeof CreateOptions>;

export const CreateHandler = withConfig<CreateHandlerOptions>(
	async ({ config, database, message }): Promise<void> => {
		await printWranglerBanner();
		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
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
				databaseInfo.migrationsFolderPath ?? DEFAULT_MIGRATION_PATH,
			createIfMissing: true,
			configPath: config.configPath,
		});
		const nextMigrationNumber = pad(getNextMigrationNumber(migrationsPath), 4);
		const migrationName = message.replaceAll(" ", "_");

		const newMigrationName = `${nextMigrationNumber}_${migrationName}.sql`;

		fs.writeFileSync(
			`${migrationsPath}/${newMigrationName}`,
			`-- Migration number: ${nextMigrationNumber} \t ${new Date().toISOString()}\n`
		);

		logger.log(`✅ Successfully created Migration '${newMigrationName}'!\n`);
		logger.log(`The migration is available for editing here`);
		logger.log(`${migrationsPath}/${newMigrationName}`);
	}
);

function pad(num: number, size: number): string {
	let newNum = num.toString();
	while (newNum.length < size) {
		newNum = "0" + newNum;
	}
	return newNum;
}
