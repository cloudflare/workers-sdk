import fs from "node:fs/promises";
import chalk from "chalk";
import { fetch } from "undici";
import { printWranglerBanner } from "..";
import { fetchResult } from "../cfetch";
import { readConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import { APIError } from "../parse";
import { requireAuth } from "../user";
import { Name } from "./options";
import { getDatabaseByNameOrBinding } from "./utils";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Database } from "./types";

export function Options(yargs: CommonYargsArgv) {
	return Name(yargs)
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
		.option("table", {
			type: "string",
			describe: "Specify which tables to include in export",
		})
		.option("output", {
			type: "string",
			describe: "Which .sql file to output to",
			demandOption: true,
		});
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof Options>;
export const Handler = async (args: HandlerOptions): Promise<void> => {
	const { local, remote, name, output, noSchema, noData, table } = args;
	await printWranglerBanner();
	const config = readConfig(args.config, args);

	if (local)
		throw new UserError(
			`Local imports/exports will be coming in a future version of Wrangler.`
		);
	if (!remote)
		throw new UserError(`You must specify either --local or --remote`);

	// Allow multiple --table x --table y flags or none
	const tables: string[] = table
		? Array.isArray(table)
			? table
			: [table]
		: [];

	const result = await exportRemotely(
		config,
		name,
		output,
		tables,
		noSchema,
		noData
	);
	return result;
};

type PollingResponse = {
	success: true;
	type: "export";
	at_bookmark: string;
	messages: string[];
	errors: string[];
} & (
	| {
			status: "active" | "error";
	  }
	| {
			status: "complete";
			result: { filename: string; signedUrl: string };
	  }
);

async function exportRemotely(
	config: Config,
	name: string,
	output: string,
	tables: string[],
	noSchema?: boolean,
	noData?: boolean
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

	if (finalResponse.status !== "complete")
		throw new APIError({ text: `D1 reset before export completed!` });

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
): Promise<PollingResponse> {
	const response = await fetchResult<
		PollingResponse | { success: false; error: string }
	>(`/accounts/${accountId}/d1/database/${db.uuid}/export`, {
		method: "POST",
		body: JSON.stringify({
			outputFormat: "polling",
			dumpOptions,
			currentBookmark,
		}),
	});

	if (!response.success) throw new Error(response.error);

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
