import path from "path";
import { configFileName } from "../../config";
import { createCommand } from "../../core/create-command";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "../constants";
import { getDatabaseInfoFromConfig } from "../utils";
import {
	getMigrationsPath,
	getUnappliedMigrations,
	initMigrationsTable,
} from "./helpers";

export const d1MigrationsListCommand = createCommand({
	metadata: {
		description: "List your D1 migrations",
		status: "stable",
		owner: "Product: D1",
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
	},
});
