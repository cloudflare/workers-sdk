import fs from "node:fs";
import path from "path";
import { Box, Text } from "ink";
import { defineCommand } from "../../core";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { renderToString } from "../../utils/render";
import { DEFAULT_MIGRATION_PATH } from "../constants";
import * as options from "../options";
import { getDatabaseInfoFromConfig } from "../utils";
import { getMigrationsPath, getNextMigrationNumber } from "./helpers";

defineCommand({
	command: "wrangler d1 migrations create",

	metadata: {
		description: "Create a new migration",
		status: "stable",
		owner: "Product: D1",
	},

	positionalArgs: ["database", "message"],
	args: {
		...options.Database,
		message: {
			describe: "The Migration message",
			type: "string",
			demandOption: true,
		},
	},

	async handler({ database, message }, { config }) {
		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
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
	},
});

function pad(num: number, size: number): string {
	let newNum = num.toString();
	while (newNum.length < size) {
		newNum = "0" + newNum;
	}
	return newNum;
}
