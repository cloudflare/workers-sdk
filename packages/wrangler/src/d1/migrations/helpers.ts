import fs from "node:fs";
import path from "node:path";
import { configFileName, UserError } from "@cloudflare/workers-utils";
import { confirm } from "../../dialogs";
import { isNonInteractiveOrCI } from "../../is-interactive";
import { logger } from "../../logger";
import { DEFAULT_MIGRATION_PATH } from "../constants";
import { executeSql } from "../execute";
import type { QueryResult } from "../execute";
import type { Migration } from "../types";
import type { Config } from "@cloudflare/workers-utils";

export async function getMigrationsPath({
	projectPath,
	migrationsFolderPath,
	createIfMissing,
	configPath,
}: {
	projectPath: string;
	migrationsFolderPath: string;
	createIfMissing: boolean;
	configPath: string | undefined;
}): Promise<string> {
	const dir = path.resolve(projectPath, migrationsFolderPath);
	if (fs.existsSync(dir)) {
		return dir;
	}

	const warning = `No migrations folder found.${
		migrationsFolderPath === DEFAULT_MIGRATION_PATH
			? ` Set \`migrations_dir\` in your ${configFileName(configPath)} file to choose a different path.`
			: ""
	}`;

	if (createIfMissing && (await confirm(`${warning}\nOk to create ${dir}?`))) {
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	} else {
		logger.warn(warning);
	}

	throw new UserError(`No migrations present at ${dir}.`);
}

export async function getUnappliedMigrations({
	migrationsTableName,
	migrationsPath,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: {
	migrationsTableName: string;
	migrationsPath: string;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
}): Promise<Array<string>> {
	const appliedMigrations = (
		await listAppliedMigrations({
			migrationsTableName,
			local,
			remote,
			config,
			name,
			persistTo,
			preview,
		})
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

type ListAppliedMigrationsProps = {
	migrationsTableName: string;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
};

const listAppliedMigrations = async ({
	migrationsTableName,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: ListAppliedMigrationsProps): Promise<Migration[]> => {
	const response: QueryResult[] | null = await executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: `SELECT *
		FROM ${migrationsTableName}
		ORDER BY id`,
		file: undefined,
		json: true,
		preview,
	});

	if (!response || response[0].results.length === 0) {
		return [];
	}

	return response[0].results as Migration[];
};

function getMigrationNames(migrationsPath: string): Array<string> {
	const migrations = [];

	const dir = fs.opendirSync(migrationsPath);

	let dirent;
	while ((dirent = dir.readSync()) !== null) {
		if (dirent.name.endsWith(".sql")) {
			migrations.push(dirent.name);
		}
	}

	dir.closeSync();

	return migrations;
}

/**
 * Returns the highest current migration number plus one, ignoring any missing numbers.
 */
export function getNextMigrationNumber(migrationsPath: string): number {
	const migrationNumbers = getMigrationNames(migrationsPath).map((migration) =>
		parseInt(migration.split("_")[0])
	);
	const highestMigrationNumber = Math.max(...migrationNumbers, 0);

	return highestMigrationNumber + 1;
}

export const initMigrationsTable = async ({
	migrationsTableName,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: {
	migrationsTableName: string;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
}) => {
	return executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: `CREATE TABLE IF NOT EXISTS ${migrationsTableName}(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`,
		file: undefined,
		json: true,
		preview,
	});
};
