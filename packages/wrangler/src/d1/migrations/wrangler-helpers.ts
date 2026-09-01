import fs from "node:fs";
import path from "node:path";
import {
	configFileName,
	isNonInteractiveOrCI,
	UserError,
} from "@cloudflare/workers-utils";
import {
	findDrizzleMigrationsPattern,
	getCreateMigrationsTableQuery,
	getListAppliedMigrationsQuery,
	getMigrationNames as getMigrationNamesFromConfig,
	getUnappliedMigrationNames,
	MigrationsConfigError,
	resolveMigrationsConfig as resolveMigrationsConfigFromOptions,
} from "@cloudflare/workers-utils/d1-migrations";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { executeSql } from "../execute";
import type { QueryResult } from "../execute";
import type { Database, Migration } from "../types";
import type { Config } from "@cloudflare/workers-utils";
import type { MigrationsConfig as SharedMigrationsConfig } from "@cloudflare/workers-utils/d1-migrations";

export {
	buildMigrationQuery,
	compareMigrationPaths,
	createMigration,
	CreateMigrationError,
	getCreateMigrationsTableQuery,
	getListAppliedMigrationsQuery,
	getNextMigrationNumber,
	getUnappliedMigrationNames,
	normalizeRelativePath,
	prepareMigration,
	writeMigration,
} from "@cloudflare/workers-utils/d1-migrations";

export type MigrationsConfig = SharedMigrationsConfig & {
	configFile: string;
	migrationsDirRaw?: string;
};

export function resolveMigrationsConfig({
	databaseInfo,
	configPath,
}: {
	databaseInfo: Database | null;
	configPath: string;
}): MigrationsConfig {
	const configFile = configFileName(configPath);
	try {
		return {
			...resolveMigrationsConfigFromOptions({
				projectPath: path.dirname(configPath),
				migrationsDir: databaseInfo?.migrationsDirRaw,
				migrationsPattern: databaseInfo?.migrationsPattern,
				migrationsTableName: databaseInfo?.migrationsTableName,
			}),
			configFile,
			migrationsDirRaw: databaseInfo?.migrationsDirRaw,
		};
	} catch (error) {
		if (!(error instanceof MigrationsConfigError)) {
			throw error;
		}
		if (error.code === "MIGRATIONS_PATTERN_REQUIRES_DIR") {
			throw new UserError(
				`You have set \`migrations_pattern: "${error.details.migrationsPattern}"\` in your ${configFile} file but have not set \`migrations_dir\` for this D1 binding.\n\n` +
					`When \`migrations_pattern\` is set, \`migrations_dir\` must also be set, and \`migrations_pattern\` must start with \`\${migrations_dir}/\`. Add a \`migrations_dir\` entry to your ${configFile} file (for example, \`"migrations_dir": "migrations"\`).`,
				{
					telemetryMessage:
						"d1 migrations migrations_pattern set without migrations_dir",
				}
			);
		}

		throw new UserError(
			`The configured \`migrations_pattern: "${error.details.migrationsPattern}"\` in your ${configFile} file must start with \`${error.details.migrationsDir}/\` to match \`"migrations_dir": "${error.details.migrationsDir}"\`.\n\n` +
				`Either change \`migrations_pattern\` so it starts with \`${error.details.migrationsDir}/\` (for example, \`"${error.details.suggestedPattern}"\`), or change \`migrations_dir\` to match the start of your pattern.`,
			{
				telemetryMessage:
					"d1 migrations migrations_pattern does not start with migrations_dir",
			}
		);
	}
}

export async function getMigrationsPath({
	projectPath,
	migrationsDir,
	migrationsDirRaw,
	createIfMissing,
	configPath,
}: {
	projectPath: string;
	migrationsDir: string;
	migrationsDirRaw: string | undefined;
	createIfMissing: boolean;
	configPath: string | undefined;
}): Promise<string> {
	const dir = path.resolve(projectPath, migrationsDir);
	if (fs.existsSync(dir)) {
		return dir;
	}

	const warning = `No migrations folder found.${
		migrationsDirRaw === undefined
			? ` Set \`migrations_dir\` in your ${configFileName(configPath)} file to choose a different path.`
			: ""
	}`;

	if (createIfMissing && (await confirm(`${warning}\nOk to create ${dir}?`))) {
		fs.mkdirSync(dir, { recursive: true });
		return dir;
	}

	logger.warn(warning);
	throw new UserError(`No migrations present at ${dir}.`, {
		telemetryMessage: "d1 migrations missing migrations directory",
	});
}

export async function getUnappliedMigrations({
	migrationsConfig,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: {
	migrationsConfig: MigrationsConfig;
	local: boolean | undefined;
	remote: boolean | undefined;
	config: Config;
	name: string;
	persistTo: string | undefined;
	preview: boolean | undefined;
}): Promise<string[]> {
	const appliedMigrations = (
		await listAppliedMigrations({
			migrationsTableName: migrationsConfig.migrationsTableName,
			local,
			remote,
			config,
			name,
			persistTo,
			preview,
		})
	).map((migration) => migration.name);
	const migrations = getMigrationNames(migrationsConfig, {
		logHint: true,
	});
	return getUnappliedMigrationNames(migrations, appliedMigrations);
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

async function listAppliedMigrations({
	migrationsTableName,
	local,
	remote,
	config,
	name,
	persistTo,
	preview,
}: ListAppliedMigrationsProps): Promise<Migration[]> {
	const response: QueryResult[] | null = await executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: getListAppliedMigrationsQuery(migrationsTableName),
		file: undefined,
		json: true,
		preview,
	});

	if (!response || response[0].results.length === 0) {
		return [];
	}
	return response[0].results as Migration[];
}

export function getMigrationNames(
	migrationsConfig: MigrationsConfig,
	options: { logHint?: boolean } = {}
): string[] {
	const names = getMigrationNamesFromConfig(migrationsConfig);
	if (options.logHint && names.length === 0) {
		maybeLogHint(migrationsConfig);
	}
	return names;
}

export function maybeLogHint(
	migrationsConfig: Pick<
		MigrationsConfig,
		"projectPath" | "migrationsDir" | "migrationsPattern" | "configFile"
	>
): void {
	const drizzlePattern = findDrizzleMigrationsPattern(migrationsConfig);
	if (drizzlePattern !== undefined) {
		logger.warn(
			`Could not find any migration files matching \`${migrationsConfig.migrationsPattern}\`. It looks like there are migration files matching \`${drizzlePattern}\` though. If you are using drizzle to manage your migrations, please set \`migrations_pattern\` to \`${drizzlePattern}\` in ${migrationsConfig.configFile}.`
		);
	}
}

export async function initMigrationsTable({
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
}) {
	return executeSql({
		local,
		remote,
		config,
		name,
		shouldPrompt: !isNonInteractiveOrCI(),
		persistTo,
		command: getCreateMigrationsTableQuery(migrationsTableName),
		file: undefined,
		json: true,
		preview,
	});
}
