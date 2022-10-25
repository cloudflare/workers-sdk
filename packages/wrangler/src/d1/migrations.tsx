import fs from "node:fs";
import path from "path";
import React from "react";
import { ConfigFields, DevConfig, Environment, withConfig } from "../config";
import { logger } from "../logger";
import { Name } from "./options";
import { d1BetaWarning, getDatabaseByNameOrBinding } from "./utils";
import type { Migration } from "./types";
import type { Argv } from "yargs";
import { BaseSqlExecuteArgs, executeSql, QueryResult } from "./execute";
import { Box, render, Text } from "ink";
import Table from "ink-table";
import { confirm } from "../dialogs";
import { ParseError } from "../parse";
import { requireAuth } from "../user";
import { Database } from "./types";

const MIGRATIONS_FOLDER_NAME = "migrations";
const MIGRATIONS_TABLE_NAME = "d1_migrations";
const MIGRATIONS_TABLE_CREATION = `
		CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME}
		(
				id         INTEGER PRIMARY KEY AUTOINCREMENT,
				name       TEXT UNIQUE,
				applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
		);
`;

function getMigrationsPath(projectPath: string): string {
	const dir = `${projectPath}/${MIGRATIONS_FOLDER_NAME}`;

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}

	return dir;
}

async function getUnappliedMigrations(
	migrationsPath: string,
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	persistTo: undefined | string
): Promise<Array<string>> {
	const appliedMigrations = (
		await listAppliedMigrations(local, config, name, persistTo)
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
	return Name(yargs);
}

export const ListHandler = withConfig<BaseSqlExecuteArgs>(
	async ({ config, name, local, persistTo }): Promise<void> => {
		const accountId = await requireAuth({});
		logger.log(d1BetaWarning);

		// This is to make sure we are inside a valid project
		await getDatabaseByNameOrBinding(config, accountId, name);

		if (!config.configPath) {
			return;
		}

		const migrationsPath = getMigrationsPath(path.dirname(config.configPath));
		await initMigrationsTable(local, config, name, persistTo);

		const unappliedMigrations = (
			await getUnappliedMigrations(
				migrationsPath,
				local,
				config,
				name,
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
	return Name(yargs);
}

export const ApplyHandler = withConfig<BaseSqlExecuteArgs>(
	async ({ config, name, local, persistTo }): Promise<void> => {
		const accountId = await requireAuth({});
		logger.log(d1BetaWarning);

		// This is to make sure we are inside a valid project
		await getDatabaseByNameOrBinding(config, accountId, name);

		if (!config.configPath) {
			return;
		}

		const migrationsPath = getMigrationsPath(path.dirname(config.configPath));
		await initMigrationsTable(local, config, name, persistTo);

		const unappliedMigrations = (
			await getUnappliedMigrations(
				migrationsPath,
				local,
				config,
				name,
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
				`About to apply ${unappliedMigrations.length} migration(s), continue?`,
				<Box flexDirection="column">
					<Text>Migrations to be applied:</Text>
					<Table data={unappliedMigrations} columns={["Name"]}></Table>
				</Box>
			);
			if (!ok) return;
		}

		for (const migration of unappliedMigrations) {
			let query = fs.readFileSync(
				`${migrationsPath}/${migration.Name}`,
				"utf8"
			);
			query += `
								INSERT INTO ${MIGRATIONS_TABLE_NAME} (name)
								values ('${migration.Name}');
						`;

			let success = true;
			let errorNotes: Array<string> = [];
			try {
				const response = await executeSql(
					local,
					config,
					name,
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
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	persistTo: undefined | string
): Promise<Migration[]> => {
	const Query = `SELECT *
									 FROM ${MIGRATIONS_TABLE_NAME}
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
		MIGRATIONS_TABLE_CREATION
	);
};

type MigrationsCreateArgs = { config?: string; name: string };

export function CreateOptions(yargs: Argv): Argv<MigrationsCreateArgs> {
	return Name(yargs);
}

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

export const CreateHandler = withConfig<MigrationsCreateArgs>(
	async ({ config, name }): Promise<void> => {
		const accountId = await requireAuth({});
		logger.log(d1BetaWarning);

		// This is to make sure we are inside a valid project
		await getDatabaseByNameOrBinding(config, accountId, name);

		if (!config.configPath) {
			return;
		}

		const migrationsPath = getMigrationsPath(path.dirname(config.configPath));
		const nextMigrationNumber = pad(getNextMigrationNumber(migrationsPath), 4);
		const migrationName = name.replace(" ", "_");

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
