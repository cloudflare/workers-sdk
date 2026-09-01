import { configFileName, UserError } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getDatabaseInfoFromConfig } from "../utils";
import {
	CreateMigrationError,
	getMigrationsPath,
	prepareMigration,
	resolveMigrationsConfig,
	writeMigration,
} from "./wrangler-helpers";

export const d1MigrationsCreateCommand = createCommand({
	metadata: {
		description: "Create a new migration",
		epilogue: dedent`
			This will generate a new versioned file inside the 'migrations' folder. Name
			your migration file as a description of your change. This will make it easier
			for you to find your migration in the 'migrations' folder. An example filename
			looks like:

				0000_create_user_table.sql

			The filename will include a version number and the migration name you specify.`,
		status: "stable",
		owner: "Product: D1",
	},
	behaviour: {
		supportTemporary: true,
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
		if (!config.configPath) {
			throw new UserError(
				"No configuration file found. Create a wrangler.jsonc file to define your D1 database.",
				{ telemetryMessage: "d1 migrations create missing config file" }
			);
		}

		const databaseInfo = getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
			throw new UserError(
				`Couldn't find a D1 DB with the name or binding '${database}' in your ${configFileName(config.configPath)} file.`,
				{
					telemetryMessage: "d1 migrations create database not found in config",
				}
			);
		}

		const migrationsConfig = resolveMigrationsConfig({
			databaseInfo,
			configPath: config.configPath,
		});

		let migration: ReturnType<typeof prepareMigration>;
		try {
			migration = prepareMigration(migrationsConfig, message);
		} catch (error) {
			if (!(error instanceof CreateMigrationError)) {
				throw error;
			}
			if (error.code === "MIGRATION_NAME_CONTAINS_PATH_SEPARATOR") {
				throw new UserError(
					`The migration name ${JSON.stringify(message)} contains a path separator ("/" or "\\"). Please remove this and try again.`,
					{
						telemetryMessage:
							"d1 migrations create name contains path separator",
					}
				);
			}
			throw new UserError(
				dedent`
					Wrangler would like to make a new migration called \`${error.details.migrationPath}\` but it does not match the configured \`migrations_pattern: "${migrationsConfig.migrationsPattern}"\` in your ${migrationsConfig.configFile} file, so \`wrangler d1 migrations apply\` would not pick it up. \`wrangler d1 migrations create\` only writes top-level files inside \`migrations_dir\`.

					If you are using an ORM like drizzle to manage migrations, use the ORM's command (e.g. \`drizzle-kit generate\`) instead of \`wrangler d1 migrations create\` — it will create files in the nested layout your \`migrations_pattern\` expects.

					Otherwise, change \`migrations_pattern\` in your ${migrationsConfig.configFile} file to match top-level \`.sql\` files (for example, \`${migrationsConfig.migrationsDir}/*.sql\`).
				`,
				{
					telemetryMessage:
						"d1 migrations create new file does not match migrations_pattern",
				}
			);
		}

		await getMigrationsPath({
			projectPath: migrationsConfig.projectPath,
			migrationsDir: migrationsConfig.migrationsDir,
			migrationsDirRaw: migrationsConfig.migrationsDirRaw,
			createIfMissing: true,
			configPath: config.configPath,
		});

		const createdMigration = writeMigration(migration);

		logger.log(
			`✅ Successfully created Migration '${createdMigration.name}'!\n`
		);
		logger.log(`The migration is available for editing here`);
		logger.log(createdMigration.path);
	},
});
