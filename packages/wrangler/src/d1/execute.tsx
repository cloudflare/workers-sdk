import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Static, Text } from "ink";
import Table from "ink-table";
import { npxImport } from "npx-import";
import React from "react";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { readFileSync } from "../parse";
import { readableRelative } from "../paths";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import * as options from "./options";
import splitSqlQuery from "./splitter";
import {
	d1BetaWarning,
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromConfig,
} from "./utils";
import type { Config, ConfigFields, DevConfig, Environment } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database } from "./types";

export type QueryResult = {
	results: Record<string, string | number | boolean>[];
	success: boolean;
	meta?: {
		duration?: number;
	};
	query?: string;
};
// Max number of statements to send in a single /execute call
const QUERY_LIMIT = 10_000;

export function Options(yargs: CommonYargsArgv) {
	return options
		.Database(yargs)
		.option("yes", {
			describe: 'Answer "yes" to any prompts',
			type: "boolean",
			alias: "y",
		})
		.option("local", {
			describe:
				"Execute commands/files against a local DB for use with wrangler dev",
			type: "boolean",
		})
		.option("file", {
			describe: "A .sql file to ingest",
			type: "string",
		})
		.option("command", {
			describe: "A single SQL statement to execute",
			type: "string",
		})
		.option("persist-to", {
			describe: "Specify directory to use for local persistence (for --local)",
			type: "string",
			requiresArg: true,
		})
		.option("json", {
			describe: "Return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.option("preview", {
			describe: "Execute commands/files against a preview D1 DB",
			type: "boolean",
			default: false,
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;

export const Handler = async (args: HandlerOptions): Promise<void> => {
	const { local, database, yes, persistTo, file, command, json, preview } =
		args;
	const existingLogLevel = logger.loggerLevel;
	if (json) {
		// set loggerLevel to error to avoid readConfig warnings appearing in JSON output
		logger.loggerLevel = "error";
	}
	const config = readConfig(args.config, args);
	logger.log(d1BetaWarning);
	if (file && command)
		return logger.error(`Error: can't provide both --command and --file.`);

	const isInteractive = process.stdout.isTTY;
	const response: QueryResult[] | null = await executeSql({
		local,
		config,
		name: database,
		shouldPrompt: isInteractive && !yes,
		persistTo,
		file,
		command,
		json,
		preview,
	});

	// Early exit if prompt rejected
	if (!response) return;

	if (isInteractive && !json) {
		// Render table if single result
		logger.log(
			renderToString(
				<Static items={response}>
					{(result) => {
						// batch results
						if (!Array.isArray(result)) {
							const { results, query } = result;

							if (Array.isArray(results) && results.length > 0) {
								const shortQuery = shorten(query, 48);
								return (
									<>
										{shortQuery ? <Text dimColor>{shortQuery}</Text> : null}
										<Table data={results}></Table>
									</>
								);
							}
						}
					}}
				</Static>
			)
		);
	} else {
		// set loggerLevel back to what it was before to actually output the JSON in stdout
		logger.loggerLevel = existingLogLevel;
		logger.log(JSON.stringify(response, null, 2));
	}
};

export async function executeSql({
	local,
	config,
	name,
	shouldPrompt,
	persistTo,
	file,
	command,
	json,
	preview,
}: {
	local: boolean | undefined;
	config: ConfigFields<DevConfig> & Environment;
	name: string;
	shouldPrompt: boolean | undefined;
	persistTo: string | undefined;
	file: string | undefined;
	command: string | undefined;
	json: boolean | undefined;
	preview: boolean | undefined;
}) {
	const sql = file ? readFileSync(file) : command;
	if (!sql) throw new Error(`Error: must provide --command or --file.`);
	if (preview && local)
		throw new Error(`Error: can't use --preview with --local`);
	if (persistTo && !local)
		throw new Error(`Error: can't use --persist-to without --local`);
	logger.log(`🌀 Mapping SQL input into an array of statements`);
	const queries = splitSqlQuery(sql);

	if (file && sql) {
		if (queries[0].startsWith("SQLite format 3")) {
			//TODO: update this error to recommend using `wrangler d1 restore` when it exists
			throw new Error(
				"Provided file is a binary SQLite database file instead of an SQL text file.\nThe execute command can only process SQL text files.\nPlease export an SQL file from your SQLite database and try again."
			);
		}
	}

	return local
		? await executeLocally({
				config,
				name,
				shouldPrompt,
				queries,
				persistTo,
				json,
		  })
		: await executeRemotely({
				config,
				name,
				shouldPrompt,
				batches: batchSplit(queries),
				json,
				preview,
		  });
}

async function executeLocally({
	config,
	name,
	shouldPrompt,
	queries,
	persistTo,
	json,
}: {
	config: Config;
	name: string;
	shouldPrompt: boolean | undefined;
	queries: string[];
	persistTo: string | undefined;
	json: boolean | undefined;
}) {
	const localDB = getDatabaseInfoFromConfig(config, name);
	if (!localDB) {
		throw new Error(
			`Can't find a DB with name/binding '${name}' in local config. Check info in wrangler.toml...`
		);
	}

	const persistencePath = getLocalPersistencePath(
		persistTo,
		true,
		config.configPath
	);

	const dbDir = path.join(persistencePath, "d1");
	const dbPath = path.join(dbDir, `${localDB.binding}.sqlite3`);
	const [{ D1Database, D1DatabaseAPI }, { createSQLiteDB }] = await npxImport<
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports
		[typeof import("@miniflare/d1"), typeof import("@miniflare/shared")]
	>(["@miniflare/d1", "@miniflare/shared"], logger.log);

	if (!existsSync(dbDir)) {
		const ok =
			json ||
			!shouldPrompt ||
			(await confirm(`About to create ${readableRelative(dbPath)}, ok?`));
		if (!ok) return null;
		await mkdir(dbDir, { recursive: true });
	}

	logger.log(`🌀 Loading DB at ${readableRelative(dbPath)}`);

	const sqliteDb = await createSQLiteDB(dbPath);
	const db = new D1Database(new D1DatabaseAPI(sqliteDb));
	const stmts = queries.map((query) => db.prepare(query));
	return (await db.batch(stmts)) as QueryResult[];
}

async function executeRemotely({
	config,
	name,
	shouldPrompt,
	batches,
	json,
	preview,
}: {
	config: Config;
	name: string;
	shouldPrompt: boolean | undefined;
	batches: string[];
	json: boolean | undefined;
	preview: boolean | undefined;
}) {
	const multiple_batches = batches.length > 1;
	// in JSON mode, we don't want a prompt here
	if (multiple_batches && !json) {
		const warning = `⚠️  Too much SQL to send at once, this execution will be sent as ${batches.length} batches.`;

		if (shouldPrompt) {
			const ok = await confirm(
				`${warning}\nℹ️  Each batch is sent individually and may leave your DB in an unexpected state if a later batch fails.\n⚠️  Make sure you have a recent backup. Ok to proceed?`
			);
			if (!ok) return null;
			logger.log(`🌀 Let's go`);
		} else {
			logger.error(warning);
		}
	}

	const accountId = await requireAuth(config);
	const db: Database = await getDatabaseByNameOrBinding(
		config,
		accountId,
		name
	);
	if (preview && !db.previewDatabaseUuid) {
		throw logger.error(
			"Please define a `preview_database_id` in your wrangler.toml to execute your queries against a preview database"
		);
	}
	const dbUuid = preview ? db.previewDatabaseUuid : db.uuid;
	logger.log(`🌀 Executing on ${name} (${dbUuid}):`);

	const results: QueryResult[] = [];
	for (const sql of batches) {
		if (multiple_batches)
			logger.log(
				chalk.gray(`  ${sql.slice(0, 70)}${sql.length > 70 ? "..." : ""}`)
			);

		const result = await fetchResult<QueryResult[]>(
			`/accounts/${accountId}/d1/database/${dbUuid}/query`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(db.internal_env ? { "x-d1-internal-env": db.internal_env } : {}),
				},
				body: JSON.stringify({ sql }),
			}
		);
		result.map(logResult);
		results.push(...result);
	}
	return results;
}

function logResult(r: QueryResult | QueryResult[]) {
	logger.log(
		`🚣 Executed ${
			Array.isArray(r) ? `${r.length} commands` : "1 command"
		} in ${
			Array.isArray(r)
				? r
						.map((d: QueryResult) => d.meta?.duration || 0)
						.reduce((a: number, b: number) => a + b, 0)
				: r.meta?.duration
		}ms`
	);
}

function batchSplit(queries: string[]) {
	logger.log(`🌀 Parsing ${queries.length} statements`);
	const num_batches = Math.ceil(queries.length / QUERY_LIMIT);
	const batches: string[] = [];
	for (let i = 0; i < num_batches; i++) {
		batches.push(
			queries.slice(i * QUERY_LIMIT, (i + 1) * QUERY_LIMIT).join("; ")
		);
	}
	if (num_batches > 1) {
		logger.log(
			`🌀 We are sending ${num_batches} batch(es) to D1 (limited to ${QUERY_LIMIT} statements per batch)`
		);
	}
	return batches;
}

function shorten(query: string | undefined, length: number) {
	return query && query.length > length
		? query.slice(0, length) + "..."
		: query;
}
