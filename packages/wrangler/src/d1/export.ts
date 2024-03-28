import fs from "node:fs/promises";
import { fetch } from "undici";
import { printWranglerBanner } from "..";
import { fetchResult } from "../cfetch";
import { readConfig, withConfig } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
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
			default: true,
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
export const Handler = withConfig<HandlerOptions>(
	async (args): Promise<void> => {
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
	}
);

type ExportMetadata = {
	signedUrl: string;
};

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
	const metadata = await fetchResult<ExportMetadata>(
		`/accounts/${accountId}/d1/database/${db.uuid}/export`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				outputFormat: "file",
				dumpOptions: {
					noSchema,
					noData,
					tables,
				},
			}),
		}
	);

	logger.log(`🌀 Downloading SQL to ${output}`);
	const contents = await fetch(metadata.signedUrl);
	await fs.writeFile(output, contents.body || "");
	logger.log(`Done!`);
}
