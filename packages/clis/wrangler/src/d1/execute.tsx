import { createReadStream, promises as fs } from "fs";
import assert from "node:assert";
import path from "node:path";
import { spinnerWhile } from "@cloudflare/cli/interactive";
import chalk from "chalk";
import { Static, Text } from "ink";
import Table from "ink-table";
import md5File from "md5-file";
import { Miniflare } from "miniflare";
import { fetch } from "undici";
import { printWranglerBanner } from "../";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { confirm } from "../dialogs";
import { createFatalError, JsonFriendlyFatalError, UserError } from "../errors";
import { logger } from "../logger";
import { APIError, readFileSync } from "../parse";
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
import type {
	Database,
	ImportInitResponse,
	ImportPollingResponse,
	PollingFailure,
} from "./types";
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
			hidden: true,
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
		throw createFatalError(
			`Error: can't provide both --command and --file.`,
			json
		);
	}

	const isInteractive = process.stdout.isTTY;
	try {
		const response: QueryResult[] | null = await executeSql({
			local,
			remote,
			config,
			name: database,
			shouldPrompt: isInteractive && !yes && !json,
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
	if (!input) {
		throw new UserError(`Error: must provide --command or --file.`);
	}
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
	if (input.file) {
		await checkForSQLiteBinary(input.file);
	}

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
		const warning = `⚠️ This process may take some time, during which your D1 database will be unavailable to serve queries.`;

		if (shouldPrompt) {
			const ok = await confirm(`${warning}\n  Ok to proceed?`);
			if (!ok) {
				return null;
			}
		} else {
			logger.warn(warning);
		}
	}

	const accountId = await requireAuth(config);
	const db: Database = await getDatabaseByNameOrBinding(
		config,
		accountId,
		name
	);
	if (preview) {
		if (!db.previewDatabaseUuid) {
			throw new UserError(
				"Please define a `preview_database_id` in your wrangler.toml to execute your queries against a preview database"
			);
		}
		db.uuid = db.previewDatabaseUuid;
	}
	logger.log(
		`🌀 Executing on ${
			db.previewDatabaseUuid ? "preview" : "remote"
		} database ${name} (${db.uuid}):`
	);
	logger.log(
		"🌀 To execute on your local development database, remove the --remote flag from your wrangler command."
	);

	if (input.file) {
		// TODO: do we need to update hashing code if we upload in parts?
		const etag = await md5File(input.file);

		logger.log(
			chalk.gray(
				`Note: if the execution fails to complete, your DB will return to its original state and you can safely retry.`
			)
		);

		const initResponse = await spinnerWhile({
			promise: d1ApiPost<
				ImportInitResponse | ImportPollingResponse | PollingFailure
			>(accountId, db, "import", { action: "init", etag }),
			startMessage: "Checking if file needs uploading",
		});

		// An init response usually returns a {filename, upload_url} pair, except if we've detected that file
		// already exists and is valid, to save people reuploading. In which case `initResponse` has already
		// kicked the import process off.
		const uploadRequired = "upload_url" in initResponse;
		if (!uploadRequired) {
			logger.log(`🌀 File already uploaded. Processing.`);
		}
		const firstPollResponse = uploadRequired
			? // Upload the file to R2, then inform D1 to start processing it. The server delays before responding
				// in case the file is quite small and can be processed without a second round-trip.
				await uploadAndBeginIngestion(
					accountId,
					db,
					input.file,
					etag,
					initResponse
				)
			: initResponse;

		// If the file takes longer than the specified delay (~1s) to import, we'll need to continue polling
		// until it's complete. If it's already finished, this call will early-exit.
		const finalResponse = await pollUntilComplete(
			firstPollResponse,
			accountId,
			db
		);

		if (finalResponse.status !== "complete") {
			throw new APIError({ text: `D1 reset before execute completed!` });
		}

		const {
			result: { num_queries, final_bookmark, meta },
		} = finalResponse;
		logger.log(
			`🚣 Executed ${num_queries} queries in ${(meta.duration / 1000).toFixed(
				2
			)} seconds (${meta.rows_read} rows read, ${
				meta.rows_written
			} rows written)\n` +
				chalk.gray(`   Database is currently at bookmark ${final_bookmark}.`)
		);

		return [
			{
				results: [
					{
						"Total queries executed": num_queries,
						"Rows read": meta.rows_read,
						"Rows written": meta.rows_written,
						"Database size (MB)": (meta.size_after / 1_000_000).toFixed(2),
					},
				],
				success: true,
				finalBookmark: final_bookmark,
				meta,
			},
		];
	} else {
		const result = await d1ApiPost<QueryResult[]>(accountId, db, "query", {
			sql: input.command,
		});
		logResult(result);
		return result;
	}
}

async function uploadAndBeginIngestion(
	accountId: string,
	db: Database,
	file: string,
	etag: string,
	initResponse: ImportInitResponse
) {
	const { upload_url, filename } = initResponse;

	const { size } = await fs.stat(file);

	const uploadResponse = await spinnerWhile({
		promise: fetch(upload_url, {
			method: "PUT",
			headers: {
				"Content-length": `${size}`,
			},
			body: createReadStream(file),
			duplex: "half", // required for NodeJS streams over .fetch ?
		}),
		startMessage: `🌀 Uploading ${filename}`,
		endMessage: `🌀 Uploading complete.`,
	});

	if (uploadResponse.status !== 200) {
		throw new UserError(
			`File could not be uploaded. Please retry.\nGot response: ${await uploadResponse.text()}`
		);
	}

	const etagResponse = uploadResponse.headers.get("etag");
	if (!etagResponse) {
		throw new UserError(`File did not upload successfully. Please retry.`);
	}
	if (etag !== etagResponse.replace(/^"|"$/g, "")) {
		throw new UserError(
			`File contents did not upload successfully. Please retry.`
		);
	}

	return await d1ApiPost<ImportPollingResponse | PollingFailure>(
		accountId,
		db,
		"import",
		{ action: "ingest", filename, etag }
	);
}

async function pollUntilComplete(
	response: ImportPollingResponse | PollingFailure,
	accountId: string,
	db: Database
): Promise<ImportPollingResponse> {
	if (!response.success) {
		throw new Error(response.error);
	}

	response.messages.forEach((line) => {
		logger.log(`🌀 ${line}`);
	});

	if (response.status === "complete") {
		return response;
	} else if (response.status === "error") {
		throw new APIError({
			text: response.errors?.join("\n"),
			notes: response.messages.map((text) => ({ text })),
		});
	} else {
		const newResponse = await d1ApiPost<ImportPollingResponse | PollingFailure>(
			accountId,
			db,
			"import",
			{
				action: "poll",
				current_bookmark: response.at_bookmark,
			}
		);
		return await pollUntilComplete(newResponse, accountId, db);
	}
}

async function d1ApiPost<T>(
	accountId: string,
	db: Database,
	action: string,
	body: unknown
) {
	try {
		return await fetchResult<T>(
			`/accounts/${accountId}/d1/database/${db.uuid}/${action}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(db.internal_env ? { "x-d1-internal-env": db.internal_env } : {}),
				},
				body: JSON.stringify(body),
			}
		);
	} catch (x) {
		if (x instanceof APIError) {
			// API Errors here are most likely to be user errors - e.g. invalid SQL.
			// So we don't want to report those to Sentry.
			x.preventReport();
		}
		throw x;
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
			"Provided file is a binary SQLite database file instead of an SQL text file. The execute command can only process SQL text files. Please export an SQL file from your SQLite database and try again."
		);
	}
}
