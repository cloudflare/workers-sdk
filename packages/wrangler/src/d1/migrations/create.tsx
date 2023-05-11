import fs from "node:fs";
import path from "path";
import { Box, Text } from "ink";
import React from "react";
import { withConfig } from "../../config";
import { logger } from "../../logger";
import { renderToString } from "../../utils/render";
import { DEFAULT_MIGRATION_PATH } from "../constants";
import { Database } from "../options";
import { d1BetaWarning, getDatabaseInfoFromConfig } from "../utils";
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
		logger.log(d1BetaWarning);

		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
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
				databaseInfo.migrationsFolderPath ?? DEFAULT_MIGRATION_PATH,
			createIfMissing: true,
		});
		const nextMigrationNumber = pad(getNextMigrationNumber(migrationsPath), 4);
		const migrationName = message.replaceAll(" ", "_");

		const newMigrationName = `${nextMigrationNumber}_${migrationName}.sql`;

		fs.writeFileSync(
			`${migrationsPath}/${newMigrationName}`,
			`-- Migration number: ${nextMigrationNumber} \t ${new Date().toISOString()}\n`
		);

		logger.log(
			renderToString(
				<Box flexDirection="column">
					<Text>
						✅ Successfully created Migration &apos;{newMigrationName}&apos;!
					</Text>
					<Text>&nbsp;</Text>
					<Text>The migration is available for editing here</Text>
					<Text>
						{migrationsPath}/{newMigrationName}
					</Text>
				</Box>
			)
		);
	}
);

function pad(num: number, size: number): string {
	let newNum = num.toString();
	while (newNum.length < size) newNum = "0" + newNum;
	return newNum;
}
