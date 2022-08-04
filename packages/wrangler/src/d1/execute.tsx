import fs from "node:fs/promises";
import { render, Static, Text } from "ink";
import Table from "ink-table";
import React from "react";
import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import { getDatabaseByName } from "./list";
import type { Database } from "./types";
import type { ArgumentsCamelCase, Argv } from "yargs";

type ExecuteArgs = {
	name: string;
	file?: string;
	command?: string;
};

type QueryResult = {
	results: Record<string, string | number | boolean>[];
	success: boolean;
	duration: number;
	query?: string;
};

export function Options(yargs: Argv): Argv<ExecuteArgs> {
	return yargs
		.positional("name", {
			describe: "The name of the DB",
			type: "string",
			demandOption: true,
		})
		.option("file", {
			describe: "A .sql file to injest",
			type: "string",
		})
		.option("command", {
			describe: "A single SQL statement to execute",
			type: "string",
		});
}

function shorten(query: string | undefined, length: number) {
	return query && query.length > length
		? query.slice(0, length) + "..."
		: query;
}

export async function Handler({
	name,
	file,
	command,
}: ArgumentsCamelCase<ExecuteArgs>): Promise<void> {
	if (!file && !command)
		return console.error(`Error: must provide --command or --file.`);
	if (file && command)
		return console.error(`Error: can't provide both --command and --file.`);

	// Only multi-queries are working atm, so throw down a little extra one.
	const sql = file ? await fs.readFile(file, "utf8") : command;

	// const [{ default: parser }, { default: splitter }] = await npxImport<
	// 	[{ default: SQL }, { default: typeof splitSqlQuery }]
	// >(
	// 	["@databases/sql@3.2.0", "@databases/split-sql-query@1.0.3"],
	// 	(msg: string) => console.log(chalk.gray(msg))
	// );
	//
	// // Only multi-queries are working atm, so throw down a little extra one.
	// const sql = file
	// 	? parser.file(file)
	// 	: command
	// 	? parser.__dangerous__rawValue(command)
	// 	: null;
	//
	// if (!sql) throw new Error(`Error: must provide --command or --file.`);
	// console.log({ sql });
	//
	// if (file) {
	// 	console.log(splitter);
	// 	console.log(splitter(sql));
	// }
	// return;

	const accountId = await requireAuth({});
	const db: Database = await getDatabaseByName(accountId, name);
	const isInteractive = process.stdout.isTTY;
	if (isInteractive) {
		console.log(`Executing on ${name} (${db.uuid}):`);
	} else {
		// Pipe to error so we don't break jq
		console.error(`Executing on ${name} (${db.uuid}):`);
	}

	const response: QueryResult[] = await fetchResult(
		`/accounts/${accountId}/d1/database/${db.uuid}/query`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ sql }),
		}
	);

	if (isInteractive) {
		render(
			<Static items={response}>
				{(result) => {
					const { results, duration, query } = result;

					if (Array.isArray(results) && results.length > 0) {
						const shortQuery = shorten(query, 48);
						return (
							<>
								{shortQuery ? <Text dimColor>{shortQuery}</Text> : null}
								<Table data={results}></Table>
							</>
						);
					} else {
						const shortQuery = shorten(query, 24);
						return (
							<Text>
								Executed{" "}
								{shortQuery ? <Text dimColor>{shortQuery}</Text> : "command"} in{" "}
								{duration}ms.
							</Text>
						);
					}
				}}
			</Static>
		);
	} else {
		console.log(JSON.stringify(response, null, 2));
	}
}
