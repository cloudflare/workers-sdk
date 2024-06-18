import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Miniflare } from "miniflare";
import { fetch } from "undici";
import { printWranglerBanner } from "..";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { getLocalPersistencePath } from "../dev/get-local-persistence-path";
import { UserError } from "../errors";
import { logger } from "../logger";
import { APIError } from "../parse";
import { readableRelative } from "../paths";
import { requireAuth } from "../user";
import { Name } from "./options";
import { getDatabaseByNameOrBinding, getDatabaseInfoFromConfig } from "./utils";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database, ExportPollingResponse, PollingFailure } from "./types";

export function Options(yargs: CommonYargsArgv) {
	return (
		Name(yargs)
			.option("local", {
				type: "boolean",
				describe: "Export from your local DB you use with wrangler dev",
				conflicts: "remote",
			})
			.option("remote", {
				type: "boolean",
				describe: "Export from your live D1",
				conflicts: "local",
			})
			.option("no-schema", {
				type: "boolean",
				describe: "Only output table contents, not the DB schema",
				conflicts: "no-data",
			})
			.option("no-data", {
				type: "boolean",
				describe:
					"Only output table schema, not the contents of the DBs themselves",
				conflicts: "no-schema",
			})
			// For --no-schema and --no-data to work, we need their positive versions
			// to be defined. But keep them hidden as they default to true
			.option("schema", {
				type: "boolean",
				hidden: true,
				default: true,
			})
			.option("data", {
				type: "boolean",
				hidden: true,
				default: true,
			})
			.option("table", {
				type: "string",
				describe: "Specify which tables to include in export",
			})
			.option("output", {
				type: "string",
				describe: "Which .sql file to output to",
				demandOption: true,
			})
	);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = async (args: HandlerOptions): Promise<void> => {
	const { local, remote, name, output, schema, data, table } = args;
	await printWranglerBanner();
	const config = readConfig(args.config, args);

	if (!local && !remote) {
		throw new UserError(`You must specify either --local or --remote`);
	}

	if (!schema && !data) {
		throw new UserError(`You cannot specify both --no-schema and --no-data`);
	}

	// Allow multiple --table x --table y flags or none
	const tables: string[] = table
		? Array.isArray(table)
			? table
			: [table]
		: [];

	if (local) {
		return await exportLocal(config, name, output, tables, !schema, !data);
	} else {
		return await exportRemotely(config, name, output, tables, !schema, !data);
	}
};

async function exportLocal(
	config: Config,
	name: string,
	output: string,
	tables: string[],
	noSchema: boolean,
	noData: boolean
) {
	const localDB = getDatabaseInfoFromConfig(config, name);
	if (!localDB) {
		throw new UserError(
			`Couldn't find a D1 DB with the name or binding '${name}' in wrangler.toml.`
		);
	}

	const id = localDB.previewDatabaseUuid ?? localDB.uuid;

	// TODO: should we allow customising persistence path?
	// Should it be --persist-to for consistency (even though this isn't persisting anything)?
	const persistencePath = getLocalPersistencePath(undefined, config.configPath);
	const d1Persist = path.join(persistencePath, "v3", "d1");

	logger.log(
		`🌀 Exporting local database ${name} (${id}) from ${readableRelative(
			d1Persist
		)}:`
	);
	logger.log(
		"🌀 To export your remote database, add a --remote flag to your wrangler command."
	);

	const mf = new Miniflare({
		modules: true,
		script: "export default {}",
		d1Persist,
		d1Databases: { DATABASE: id },
	});
	const db = await mf.getD1Database("DATABASE");
	logger.log(`🌀 Exporting SQL to ${output}...`);

	try {
		// Special local-only export pragma. Query must be exactly this string to work.
		const dump = await db
			.prepare(`PRAGMA miniflare_d1_export(?,?,?);`)
			.bind(noSchema, noData, ...tables)
			.raw();
		await fs.writeFile(output, dump[0].join("\n"));
	} catch (e) {
		throw new UserError((e as Error).message);
	} finally {
		await mf.dispose();
	}

	logger.log(`Done!`);
}

async function exportRemotely(
	config: Config,
	name: string,
	output: string,
	tables: string[],
	noSchema: boolean,
	noData: boolean
) {
	const accountId = await requireAuth(config);
	const db: Database = await getDatabaseByNameOrBinding(
		config,
		accountId,
		name
	);

	logger.log(`🌀 Executing on remote database ${name} (${db.uuid}):`);
	logger.log(`🌀 Creating export...`);
	const dumpOptions = {
		noSchema,
		noData,
		tables,
	};

	const finalResponse = await pollExport(accountId, db, dumpOptions, undefined);

	if (finalResponse.status !== "complete") {
		throw new APIError({ text: `D1 reset before export completed!` });
	}

	logger.log(`🌀 Downloading SQL to ${output}...`);
	logger.log(
		chalk.gray(
			`You can also download your export from the following URL manually. This link will be valid for one hour: ${finalResponse.result.signedUrl}`
		)
	);
	const contents = await fetch(finalResponse.result.signedUrl);
	await fs.writeFile(output, contents.body || "");
	logger.log(`Done!`);
}

async function pollExport(
	accountId: string,
	db: Database,
	dumpOptions: {
		tables: string[];
		noSchema?: boolean;
		noData?: boolean;
	},
	currentBookmark: string | undefined,
	num_parts_uploaded = 0
): Promise<ExportPollingResponse> {
	const response = await fetchResult<ExportPollingResponse | PollingFailure>(
		`/accounts/${accountId}/d1/database/${db.uuid}/export`,
		{
			method: "POST",
			body: JSON.stringify({
				outputFormat: "polling",
				dumpOptions,
				currentBookmark,
			}),
		}
	);

	if (!response.success) {
		throw new Error(response.error);
	}

	response.messages.forEach((line) => {
		if (line.startsWith(`Uploaded part`)) {
			// Part numbers can be reported as complete out-of-order which looks confusing to a user. But their ID has no
			// special meaning, so just make them sequential.
			logger.log(`🌀 Uploaded part ${++num_parts_uploaded}`);
		} else {
			logger.log(`🌀 ${line}`);
		}
	});

	if (response.status === "complete") {
		return response;
	} else if (response.status === "error") {
		throw new APIError({
			text: response.errors.join("\n"),
			notes: response.messages.map((text) => ({ text })),
		});
	} else {
		return await pollExport(
			accountId,
			db,
			dumpOptions,
			response.at_bookmark,
			num_parts_uploaded
		);
	}
}
