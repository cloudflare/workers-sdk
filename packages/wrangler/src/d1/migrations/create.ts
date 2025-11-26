import fs from "node:fs";
import path from "node:path";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { DEFAULT_MIGRATION_PATH } from "../constants";
import { getDatabaseInfoFromConfig } from "../utils";
import { getMigrationsPath, getNextMigrationNumber } from "./helpers";

export const d1MigrationsCreateCommand = createCommand({
	metadata: {
		description: "Create a new migration",
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		printBanner: true,
	},
	args: {
		database: {
			type: "string",
			demandOption: true,
			description: "The name or binding of the DB",
		},
		message: {
			type: "string",
			demandOption: true,
			description: "The Migration message",
		},
	},
	positionalArgs: ["database", "message"],
	async handler({ database, message }, { config }) {
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
	},
});

function pad(num: number, size: number): string {
	let newNum = num.toString();
	while (newNum.length < size) {
		newNum = "0" + newNum;
	}
	return newNum;
}
