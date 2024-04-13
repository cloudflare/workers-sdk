import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Static, Text } from "ink";
import Table from "ink-table";
import { Miniflare } from "miniflare";
import React from "react";
import { printWranglerBanner } from "../";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { confirm } from "../dialogs";
import { JsonFriendlyFatalError, UserError } from "../errors";
import { logger } from "../logger";
import { readFileSync } from "../parse";
import { readableRelative } from "../paths";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import * as options from "./options";
import splitSqlQuery from "./splitter";
import { getDatabaseByNameOrBinding, getDatabaseInfoFromConfig } from "./utils";
import type { Config, ConfigFields, DevConfig, Environment } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database } from "./types";
import type { D1Result } from "@cloudflare/workers-types/experimental";

export type QueryResult = {
	results: Record<string, string | number | boolean>[];
	success: boolean;
	meta?: {
		duration?: number;
	};
	query?: string;
};

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
		.option("remote", {
			describe:
				"Execute commands/files against a remote DB for use with wrangler dev",
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
		})
		.option("batch-size", {
			describe: "Number of queries to send in a single batch",
			type: "number",
			deprecated: true,
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;

export const Handler = async (args: HandlerOptions): Promise<void> => {
	const {
		local,
		remote,
		database,
		yes,
		persistTo,
		file,
		command,
		json,
		preview,
	} = args;
	const existingLogLevel = logger.loggerLevel;
	if (json) {
		// set loggerLevel to error to avoid readConfig warnings appearing in JSON output
		logger.loggerLevel = "error";
	}
	await printWranglerBanner();

	const config = readConfig(args.config, args);

	if (file && command) {
		return logger.error(`Error: can't provide both --command and --file.`);
	}

	const isInteractive = process.stdout.isTTY;
	try {
		const response: QueryResult[] | null = await executeSql({
			local,
			remote,
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
		if (!response) {
			return;
		}

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
	} catch (error) {
		if (json && error instanceof Error) {
			logger.loggerLevel = existingLogLevel;
			const messageToDisplay =
				error.name === "APIError" ? error : { text: error.message };
			throw new JsonFriendlyFatalError(
				JSON.stringify({ error: messageToDisplay }, null, 2)
			);
		} else {
			throw error;
		}
	}
};

type ExecuteInput =
	| { file: string; command: never }
	| { file: never; command: string };

export async function executeSql({
	local,
	remote,
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
	remote: boolean | undefined;
	config: ConfigFields<DevConfig> & Environment;
	name: string;
	shouldPrompt: boolean | undefined;
	persistTo: string | undefined;
	file: string | undefined;
	command: string | undefined;
	json: boolean | undefined;
	preview: boolean | undefined;
}) {
	const existingLogLevel = logger.loggerLevel;
	if (json) {
		// set loggerLevel to error to avoid logs appearing in JSON output
		logger.loggerLevel = "error";
	}

	const input = file
		? ({ file } as ExecuteInput)
		: command
		? ({ command } as ExecuteInput)
		: null;
	if (!input) throw new UserError(`Error: must provide --command or --file.`);
	if (local && remote) {
		throw new UserError(
			`Error: can't use --local and --remote at the same time`
		);
	}
	if (preview && !remote) {
		throw new UserError(`Error: can't use --preview without --remote`);
	}
	if (persistTo && !local) {
		throw new UserError(`Error: can't use --persist-to without --local`);
	}
	logger.log(`🌀 Mapping SQL input into an array of statements`);

	if (input.file) await checkForSQLiteBinary(input.file);

	const result =
		remote || preview
			? await executeRemotely({
					config,
					name,
					shouldPrompt,
					input,
					preview,
				})
			: await executeLocally({
					config,
					name,
					input,
					persistTo,
				});

	if (json) {
		logger.loggerLevel = existingLogLevel;
	}
	return result;
}

async function executeLocally({
	config,
	name,
	input,
	persistTo,
}: {
	config: Config;
	name: string;
	input: ExecuteInput;
	persistTo: string | undefined;
}) {
	const localDB = getDatabaseInfoFromConfig(config, name);
	if (!localDB) {
		throw new UserError(
			`Couldn't find a D1 DB with the name or binding '${name}' in wrangler.toml.`
		);
	}

	const id = localDB.previewDatabaseUuid ?? localDB.uuid;
	const persistencePath = getLocalPersistencePath(persistTo, config.configPath);
	const d1Persist = path.join(persistencePath, "v3", "d1");

	logger.log(
		`🌀 Executing on local database ${name} (${id}) from ${readableRelative(
			d1Persist
		)}:`
	);
	logger.log(
		"🌀 To execute on your remote database, add a --remote flag to your wrangler command."
	);

	const mf = new Miniflare({
		modules: true,
		script: "",
		d1Persist,
		d1Databases: { DATABASE: id },
	});
	const db = await mf.getD1Database("DATABASE");

	const sql = input.file ? readFileSync(input.file) : input.command;
	const queries = splitSqlQuery(sql);

	let results: D1Result<Record<string, string | number | boolean>>[];
	try {
		results = await db.batch(queries.map((query) => db.prepare(query)));
	} catch (e: unknown) {
		throw (e as { cause?: unknown })?.cause ?? e;
	} finally {
		await mf.dispose();
	}
	assert(Array.isArray(results));
	return results.map<QueryResult>((result) => ({
		results: (result.results ?? []).map((row) =>
			Object.fromEntries(
				Object.entries(row).map(([key, value]) => {
					if (Array.isArray(value)) {
						value = `[${value.join(", ")}]`;
					}
					if (value === null) {
						value = "null";
					}
					return [key, value];
				})
			)
		),
		success: result.success,
		meta: { duration: result.meta?.duration },
	}));
}

async function executeRemotely({
	config,
	name,
	shouldPrompt,
	input,
	preview,
}: {
	config: Config;
	name: string;
	shouldPrompt: boolean | undefined;
	input: ExecuteInput;
	preview: boolean | undefined;
}) {
	if (input.file) {
		const warning = `ℹ️  This process may take some time, during which your D1 will be unavailable to serve queries.`;

		if (shouldPrompt) {
			const ok = await confirm(`${warning}\n  Ok to proceed?`);
			if (!ok) return null;
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
		const error = new UserError(
			"Please define a `preview_database_id` in your wrangler.toml to execute your queries against a preview database"
		);
		logger.error(error.message);
		throw error;
	}
	const dbUuid = preview ? db.previewDatabaseUuid : db.uuid;
	logger.log(`🌀 Executing on remote database ${name} (${dbUuid}):`);
	logger.log(
		"🌀 To execute on your local development database, remove the --remote flag from your wrangler command."
	);

	if (input.file) {
		return null;
	} else {
		const result = await fetchResult<QueryResult[]>(
			`/accounts/${accountId}/d1/database/${dbUuid}/query`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(db.internal_env ? { "x-d1-internal-env": db.internal_env } : {}),
				},
				body: JSON.stringify({ sql: input.command }),
			}
		);
		logResult(result);
		return result;
	}
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

function shorten(query: string | undefined, length: number) {
	return query && query.length > length
		? query.slice(0, length) + "..."
		: query;
}

async function checkForSQLiteBinary(filename: string) {
	const fd = await fs.open(filename, "r");
	const buffer = Buffer.alloc(15);
	await fd.read(buffer, 0, 15);
	if (buffer.toString("utf8") === "SQLite format 3") {
		throw new UserError(
			"Provided file is a binary SQLite database file instead of an SQL text file.\nThe execute command can only process SQL text files.\nPlease export an SQL file from your SQLite database and try again."
		);
	}
}
