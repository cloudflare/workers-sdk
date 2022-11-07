import fs from "node:fs";
import path from "path";
import { Box, render, Text } from "ink";
import Table from "ink-table";
import React from "react";
import { withConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { createBackup } from "./backups";
import { DEFAULT_MIGRATION_PATH } from "./constants";
import { executeSql } from "./execute";
import { Database } from "./options";
import { d1BetaWarning, getDatabaseInfoFromConfig } from "./utils";
import type { ConfigFields, DevConfig, Environment } from "../config";
import type { ParseError } from "../parse";
import type { BaseSqlExecuteArgs, QueryResult } from "./execute";
import type { Migration } from "./types";
import type { Argv } from "yargs";

async function getMigrationsPath(
	projectPath: string,
	migrationsFolderPath: string,
	createIfMissing: boolean
): Promise<string> {
	const dir = path.resolve(projectPath, migrationsFolderPath);
	if (fs.existsSync(dir)) return dir;

	const warning = `No migrations folder found.${
		migrationsFolderPath === DEFAULT_MIGRATION_PATH
			? " Set `migrations_dir` in wrangler.toml to choose a different path."
			: ""
	}`;

	if (createIfMissing && (await confirm(`${warning}\nOk to create ${dir}?`))) {
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	} else {
		logger.warn(warning);
	}

	throw new Error(`No migrations present at ${dir}.`);
}

async function getUnappliedMigrations(
	migrationsTableName: string,
	migrationsPath: string,
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	persistTo: undefined | string
): Promise<Array<string>> {
	const appliedMigrations = (
		await listAppliedMigrations(
			migrationsTableName,
			local,
			config,
			name,
			persistTo
		)
	).map((migration) => {
		return migration.name;
	});
	const projectMigrations = getMigrationNames(migrationsPath);

	const unappliedMigrations: Array<string> = [];

	for (const migration of projectMigrations) {
		if (!appliedMigrations.includes(migration)) {
			unappliedMigrations.push(migration);
		}
	}

	return unappliedMigrations;
}

export function ListOptions(yargs: Argv): Argv<BaseSqlExecuteArgs> {
	return Database(yargs);
}

export const ListHandler = withConfig<BaseSqlExecuteArgs>(
	async ({ config, database, local, persistTo }): Promise<void> => {
		await requireAuth({});
		logger.log(d1BetaWarning);

		const databaseInfo = await getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
			throw new Error(
				`Can't find a DB with name/binding '${database}' in local config. Check info in wrangler.toml...`
			);
		}

		if (!config.configPath) {
			return;
		}
		const { migrationsTableName, migrationsFolderPath } = databaseInfo;

		const migrationsPath = await getMigrationsPath(
			path.dirname(config.configPath),
			migrationsFolderPath,
			false
		);
		await initMigrationsTable(
			migrationsTableName,
			local,
			config,
			database,
			persistTo
		);

		const unappliedMigrations = (
			await getUnappliedMigrations(
				migrationsTableName,
				migrationsPath,
				local,
				config,
				database,
				persistTo
			)
		).map((migration) => {
			return {
				Name: migration,
			};
		});

		if (unappliedMigrations.length === 0) {
			render(<Text>✅ No migrations to apply!</Text>);
			return;
		}

		render(
			<Box flexDirection="column">
				<Text>Migrations to be applied:</Text>
				<Table data={unappliedMigrations} columns={["Name"]}></Table>
			</Box>
		);
	}
);

export function ApplyOptions(yargs: Argv): Argv<BaseSqlExecuteArgs> {
	return Database(yargs);
}

export const ApplyHandler = withConfig<BaseSqlExecuteArgs>(
	async ({ config, database, local, persistTo }): Promise<void> => {
		const accountId = await requireAuth({});
		logger.log(d1BetaWarning);

		const databaseInfo = await getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
			throw new Error(
				`Can't find a DB with name/binding '${database}' in local config. Check info in wrangler.toml...`
			);
		}

		if (!config.configPath) {
			return;
		}

		const migrationsPath = await getMigrationsPath(
			path.dirname(config.configPath),
			databaseInfo.migrationsFolderPath,
			false
		);
		await initMigrationsTable(
			databaseInfo.migrationsTableName,
			local,
			config,
			database,
			persistTo
		);

		const unappliedMigrations = (
			await getUnappliedMigrations(
				databaseInfo.migrationsTableName,
				migrationsPath,
				local,
				config,
				database,
				persistTo
			)
		)
			.map((migration) => {
				return {
					Name: migration,
					Status: "🕒️",
				};
			})
			.sort((a, b) => {
				const migrationNumberA = parseInt(a.Name.split("_")[0]);
				const migrationNumberB = parseInt(b.Name.split("_")[0]);
				if (migrationNumberA < migrationNumberB) {
					return -1;
				}
				if (migrationNumberA > migrationNumberB) {
					return 1;
				}

				// numbers must be equal
				return 0;
			});

		if (unappliedMigrations.length === 0) {
			render(<Text>✅ No migrations to apply!</Text>);
			return;
		}

		const isInteractive = process.stdout.isTTY;
		if (isInteractive) {
			const ok = await confirm(
				`About to apply ${unappliedMigrations.length} migration(s)\n` +
					"Your database may not be available to serve requests during the migration, continue?",
				<Box flexDirection="column">
					<Text>Migrations to be applied:</Text>
					<Table data={unappliedMigrations} columns={["Name"]}></Table>
				</Box>
			);
			if (!ok) return;
		}

		render(<Text>🕒 Creating backup...</Text>);
		await createBackup(accountId, databaseInfo.uuid);

		for (const migration of unappliedMigrations) {
			let query = fs.readFileSync(
				`${migrationsPath}/${migration.Name}`,
				"utf8"
			);
			query += `
								INSERT INTO ${databaseInfo.migrationsTableName} (name)
								values ('${migration.Name}');
						`;

			let success = true;
			let errorNotes: Array<string> = [];
			try {
				const response = await executeSql(
					local,
					config,
					database,
					undefined,
					persistTo,
					undefined,
					query
				);

				if (response === null) {
					// TODO:  return error
					return;
				}

				for (const result of response) {
					// When executing more than 1 statement, response turns into an array of QueryResult
					if (Array.isArray(result)) {
						for (const subResult of result) {
							if (!subResult.success) {
								success = false;
							}
						}
					} else {
						if (!result.success) {
							success = false;
						}
					}
				}
			} catch (e) {
				const err = e as ParseError;

				success = false;
				errorNotes = err.notes.map((msg) => msg.text);
			}

			migration.Status = success ? "✅" : "❌";

			render(
				<Box flexDirection="column">
					<Table
						data={unappliedMigrations}
						columns={["Name", "Status"]}
					></Table>
					{errorNotes.length > 0 && (
						<Box flexDirection="column">
							<Text>&nbsp;</Text>
							<Text>
								❌ Migration {migration.Name} failed with following Errors
							</Text>
							<Table
								data={errorNotes.map((err) => {
									return { Error: err };
								})}
							></Table>
						</Box>
					)}
				</Box>
			);

			if (errorNotes.length > 0) return;
		}
	}
);

export const listAppliedMigrations = async (
	migrationsTableName: string,
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	persistTo: undefined | string
): Promise<Migration[]> => {
	const Query = `SELECT *
									 FROM ${migrationsTableName}
									 ORDER BY id`;

	const response: QueryResult[] | null = await executeSql(
		local,
		config,
		name,
		undefined,
		persistTo,
		undefined,
		Query
	);

	if (!response || response[0].results.length === 0) return [];

	return response[0].results as Migration[];
};

const initMigrationsTable = async (
	migrationsTableName: string,
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	persistTo: undefined | string
) => {
	return executeSql(
		local,
		config,
		name,
		undefined,
		persistTo,
		undefined,
		`
						CREATE TABLE IF NOT EXISTS ${migrationsTableName}
						(
								id         INTEGER PRIMARY KEY AUTOINCREMENT,
								name       TEXT UNIQUE,
								applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
						);
				`
	);
};

function getMigrationNames(migrationsPath: string): Array<string> {
	const migrations = [];

	const dir = fs.opendirSync(migrationsPath);

	let dirent;
	while ((dirent = dir.readSync()) !== null) {
		if (dirent.name.endsWith(".sql")) migrations.push(dirent.name);
	}

	dir.closeSync();

	return migrations;
}

function getNextMigrationNumber(migrationsPath: string): number {
	let highestMigrationNumber = -1;

	for (const migration in getMigrationNames(migrationsPath)) {
		const migrationNumber = parseInt(migration.split("_")[0]);

		if (migrationNumber > highestMigrationNumber) {
			highestMigrationNumber = migrationNumber;
		}
	}

	return highestMigrationNumber + 1;
}

function pad(num: number, size: number): string {
	let newNum = num.toString();
	while (newNum.length < size) newNum = "0" + newNum;
	return newNum;
}

type MigrationsCreateArgs = {
	config?: string;
	database: string;
	message: string;
};

export function CreateOptions(yargs: Argv): Argv<MigrationsCreateArgs> {
	return Database(yargs).positional("message", {
		describe: "The Migration message",
		type: "string",
		demandOption: true,
	});
}

export const CreateHandler = withConfig<MigrationsCreateArgs>(
	async ({ config, database, message }): Promise<void> => {
		await requireAuth({});
		logger.log(d1BetaWarning);

		const databaseInfo = await getDatabaseInfoFromConfig(config, database);
		if (!databaseInfo) {
			throw new Error(
				`Can't find a DB with name/binding '${database}' in local config. Check info in wrangler.toml...`
			);
		}

		if (!config.configPath) {
			return;
		}

		const migrationsPath = await getMigrationsPath(
			path.dirname(config.configPath),
			databaseInfo.migrationsFolderPath,
			true
		);
		const nextMigrationNumber = pad(getNextMigrationNumber(migrationsPath), 4);
		const migrationName = message.replaceAll(" ", "_");

		const newMigrationName = `${nextMigrationNumber}_${migrationName}.sql`;

		fs.writeFileSync(
			`${migrationsPath}/${newMigrationName}`,
			`-- Migration number: ${nextMigrationNumber} \t ${new Date().toISOString()}\n`
		);

		render(
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
		);
	}
);
