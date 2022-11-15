import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { render, Static, Text } from "ink";
import Table from "ink-table";
import { npxImport } from "npx-import";
import React from "react";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { confirm, logDim } from "../dialogs";
import { logger } from "../logger";
import { readableRelative } from "../paths";
import { requireAuth } from "../user";
import * as options from "./options";
import {
	d1BetaWarning,
	getDatabaseByNameOrBinding,
	getDatabaseInfoFromConfig,
} from "./utils";
import type { Config, ConfigFields, DevConfig, Environment } from "../config";
import type { Database } from "./types";
import type splitSqlQuery from "@databases/split-sql-query";
import type { SQL, SQLQuery } from "@databases/sql";
import type { Statement as StatementType } from "@miniflare/d1";
import type { createSQLiteDB as createSQLiteDBType } from "@miniflare/shared";
import type { Argv } from "yargs";

type MiniflareNpxImportTypes = [
	{
		Statement: typeof StatementType;
	},
	{
		createSQLiteDB: typeof createSQLiteDBType;
	}
];

export type BaseSqlExecuteArgs = {
	config?: string;
	database: string;
	local?: boolean;
	"persist-to"?: string;
};

type ExecuteArgs = BaseSqlExecuteArgs & {
	file?: string;
	command?: string;
};

export type QueryResult = {
	results: Record<string, string | number | boolean>[];
	success: boolean;
	duration: number;
	query?: string;
};
// Max number of bytes to send in a single /execute call
const QUERY_LIMIT = 10_000;

export function Options(yargs: Argv): Argv<ExecuteArgs> {
	return options
		.Database(yargs)
		.option("local", {
			describe:
				"Execute commands/files against a local DB for use with wrangler dev",
			type: "boolean",
		})
		.option("file", {
			describe: "A .sql file to injest",
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
		});
}

function shorten(query: string | undefined, length: number) {
	return query && query.length > length
		? query.slice(0, length) + "..."
		: query;
}

export async function executeSql(
	local: undefined | boolean,
	config: ConfigFields<DevConfig> & Environment,
	name: string,
	isInteractive: boolean | undefined,
	persistTo: undefined | string,
	file?: string,
	command?: string
) {
	const { parser, splitter } = await loadSqlUtils();

	const sql = file
		? parser.file(file)
		: command
		? parser.__dangerous__rawValue(command)
		: null;

	if (!sql) throw new Error(`Error: must provide --command or --file.`);
	if (persistTo && !local)
		throw new Error(`Error: can't use --persist-to without --local`);

	return local
		? await executeLocally(
				config,
				name,
				isInteractive,
				splitSql(splitter, sql),
				persistTo
		  )
		: await executeRemotely(
				config,
				name,
				isInteractive,
				batchSplit(splitter, sql)
		  );
}

export const Handler = withConfig<ExecuteArgs>(
	async ({
		config,
		database,
		file,
		command,
		local,
		persistTo,
	}): Promise<void> => {
		logger.log(d1BetaWarning);
		if (file && command)
			return console.error(`Error: can't provide both --command and --file.`);

		const isInteractive = process.stdout.isTTY;
		const response: QueryResult[] | null = await executeSql(
			local,
			config,
			database,
			isInteractive,
			persistTo,
			file,
			command
		);

		// Early exit if prompt rejected
		if (!response) return;

		if (isInteractive) {
			// Render table if single result
			render(
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
			);
		} else {
			console.log(JSON.stringify(response, null, 2));
		}
	}
);

async function executeLocally(
	config: Config,
	name: string,
	isInteractive: boolean | undefined,
	queries: string[],
	persistTo: string | undefined
) {
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
	const [{ Statement }, { createSQLiteDB }] =
		await npxImport<MiniflareNpxImportTypes>(
			["@miniflare/d1", "@miniflare/shared"],
			logDim
		);

	if (!existsSync(dbDir) && isInteractive) {
		const ok = await confirm(
			`About to create ${readableRelative(dbPath)}, ok?`
		);
		if (!ok) return null;
		await mkdir(dbDir, { recursive: true });
	}

	logger.log(`🌀 Loading DB at ${readableRelative(dbPath)}`);
	const db = await createSQLiteDB(dbPath);

	const results: QueryResult[] = [];
	for (const sql of queries) {
		const statement = new Statement(db, sql);
		results.push((await statement.all()) as QueryResult);
	}

	return results;
}

async function executeRemotely(
	config: Config,
	name: string,
	isInteractive: boolean | undefined,
	batches: string[]
) {
	if (batches.length > 1) {
		const warning = `⚠️  Too much SQL to send at once, this execution will be sent as ${batches.length} batches.`;

		if (isInteractive) {
			const ok = await confirm(
				`${warning}\nℹ️  Each batch is sent individually and may leave your DB in an unexpected state if a later batch fails.\n⚠️  Make sure you have a recent backup. Ok to proceed?`
			);
			if (!ok) return null;
			logger.log(`🌀 Let's go`);
		} else {
			console.error(warning);
		}
	}

	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByNameOrBinding(
		config,
		accountId,
		name
	);

	if (isInteractive) {
		logger.log(`🌀 Executing on ${name} (${db.uuid}):`);

		// Don't output if isInteractive is undefined
	} else if (isInteractive !== undefined) {
		// Pipe to error so we don't break jq
		console.error(`Executing on ${name} (${db.uuid}):`);
	}

	const results: QueryResult[] = [];
	for (const sql of batches) {
		const result = await fetchResult<QueryResult[]>(
			`/accounts/${accountId}/d1/database/${db.uuid}/query`,
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
		`🚣 Executed ${Array.isArray(r) ? r.length : "1"} command(s) in ${
			Array.isArray(r)
				? r
						.map((d: QueryResult) => d.duration)
						.reduce((a: number, b: number) => a + b, 0)
				: r.duration
		}ms`
	);
}

function splitSql(splitter: (query: SQLQuery) => SQLQuery[], sql: SQLQuery) {
	// We have no interpolations, so convert everything to text
	logger.log(`🌀 Mapping SQL input into an array of statements`);
	return splitter(sql).map(
		(q) =>
			q.format({
				escapeIdentifier: (_) => "",
				formatValue: (_, __) => ({ placeholder: "", value: "" }),
			}).text
	);
}

function batchSplit(splitter: typeof splitSqlQuery, sql: SQLQuery) {
	const queries = splitSql(splitter, sql);
	logger.log(`🌀 Parsing ${queries.length} statements`);
	const batches: string[] = [];
	const nbatches = Math.floor(queries.length / QUERY_LIMIT);
	for (let i = 0; i <= nbatches; i++) {
		batches.push(
			queries.slice(i * QUERY_LIMIT, (i + 1) * QUERY_LIMIT).join("; ")
		);
	}
	logger.log(
		`🌀 We are sending ${batches.length} batch(es) to D1 (limited to ${QUERY_LIMIT} statements per batch)`
	);
	return batches;
}

async function loadSqlUtils() {
	const [
		{ default: parser },
		{
			// No idea why this is doubly-nested, see https://github.com/ForbesLindesay/atdatabases/issues/255
			default: { default: splitter },
		},
	] = await npxImport<
		[{ default: SQL }, { default: { default: typeof splitSqlQuery } }]
	>(["@databases/sql@3.2.0", "@databases/split-sql-query@1.0.3"], logDim);
	return { parser, splitter };
}
