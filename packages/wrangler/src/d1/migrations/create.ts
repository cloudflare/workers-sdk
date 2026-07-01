import fs from "node:fs";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import { Minimatch } from "minimatch";
import dedent from "ts-dedent";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { getDatabaseInfoFromConfig } from "../utils";
import {
	getMigrationsPath,
	getNextMigrationNumber,
	normalizeRelativePath,
	resolveMigrationsConfig,
} from "./helpers";

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

		const nextMigrationNumber = pad(
			getNextMigrationNumber(migrationsConfig),
			4
		);
		const migrationName = message.replaceAll(" ", "_");

		// `wrangler d1 migrations create` writes a single file directly inside
		// `migrations_dir`, so a name containing a path separator can't work —
		// it would imply nested directories. Reject it up front with a clear
		// message, rather than letting it fall through to the confusing "does
		// not match migrations_pattern" error below (a name like `foo/bar`
		// produces an extra path segment that the pattern can't match).
		if (/[\\/]/.test(migrationName)) {
			throw new UserError(
				`The migration name ${JSON.stringify(message)} contains a path separator ("/" or "\\"). Please remove this and try again.`,
				{
					telemetryMessage: "d1 migrations create name contains path separator",
				}
			);
		}

		const newMigrationName = `${nextMigrationNumber}_${migrationName}.sql`;

		// Make sure the migration we are about to create will actually be picked
		// up by `wrangler d1 migrations apply` — i.e. it matches the configured
		// `migrations_pattern`. The default `${migrations_dir}/*.sql` always
		// matches top-level `.sql` files, so this only fires for a user-set
		// pattern.
		//
		// This runs BEFORE `getMigrationsPath` so we don't prompt the user to
		// create a `migrations_dir` we'll then refuse to write into.
		const matcher = new Minimatch(migrationsConfig.migrationsPattern, {
			dot: false,
		});
		// Normalize so the path is shaped like the entries
		// `getMigrationNames` matches against `migrationsPattern` — both
		// `migrationsDir` and `migrationsPattern` are normalized, so the
		// proposed path must be too. In particular, for `migrations_dir: "."`
		// this strips the leading `./` (which would otherwise split into a
		// separate segment and never match the normalized pattern).
		const proposedPath = normalizeRelativePath(
			`${migrationsConfig.migrationsDir}/${newMigrationName}`
		);
		if (!matcher.match(proposedPath)) {
			throw new UserError(
				dedent`
					Wrangler would like to make a new migration called \`${proposedPath}\` but it does not match the configured \`migrations_pattern: "${migrationsConfig.migrationsPattern}"\` in your ${migrationsConfig.configFile} file, so \`wrangler d1 migrations apply\` would not pick it up. \`wrangler d1 migrations create\` only writes top-level files inside \`migrations_dir\`.

					If you are using an ORM like drizzle to manage migrations, use the ORM's command (e.g. \`drizzle-kit generate\`) instead of \`wrangler d1 migrations create\` — it will create files in the nested layout your \`migrations_pattern\` expects.

					Otherwise, change \`migrations_pattern\` in your ${migrationsConfig.configFile} file to match top-level \`.sql\` files (for example, \`${migrationsConfig.migrationsDir}/*.sql\`).
				`,
				{
					telemetryMessage:
						"d1 migrations create new file does not match migrations_pattern",
				}
			);
		}

		const migrationsPath = await getMigrationsPath({
			projectPath: migrationsConfig.projectPath,
			migrationsDir: migrationsConfig.migrationsDir,
			migrationsDirRaw: migrationsConfig.migrationsDirRaw,
			createIfMissing: true,
			configPath: config.configPath,
		});

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
