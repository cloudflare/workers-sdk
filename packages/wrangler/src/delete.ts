import path from "path";
import { fetchResult } from "./cfetch";
import { findWranglerToml, readConfig } from "./config";
import { confirm } from "./dialogs";
import { CI } from "./is-ci";
import isInteractive from "./is-interactive";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import { getScriptName, printWranglerBanner } from "./index";
import type { ConfigPath } from "./index";
import type { YargsOptionsToInterface } from "./yargs-types";
import type { Argv, ArgumentsCamelCase } from "yargs";

export function deleteOptions(yargs: Argv) {
	return yargs
		.option("env", {
			type: "string",
			requiresArg: true,
			describe: "Perform on a specific environment",
			alias: "e",
		})
		.positional("script", {
			describe: "The path to an entry point for your worker",
			type: "string",
			requiresArg: true,
		})
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.option("dry-run", {
			describe: "Don't actually delete",
			type: "boolean",
		})
		.option("legacy-env", {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		});
}

type DeleteArgs = YargsOptionsToInterface<typeof deleteOptions>;

export async function deleteHandler(args: ArgumentsCamelCase<DeleteArgs>) {
	await printWranglerBanner();

	const configPath =
		(args.config as ConfigPath) ||
		(args.script && findWranglerToml(path.dirname(args.script)));
	const config = readConfig(configPath, args);
	await metrics.sendMetricsEvent(
		"delete worker script",
		{},
		{ sendMetrics: config.send_metrics }
	);

	const accountId = args.dryRun ? undefined : await requireAuth(config);

	const scriptName = getScriptName(args, config);

	if (args.dryRun) {
		logger.log(`--dry-run: exiting now.`);
		return;
	}

	let confirmed = true;
	if (isInteractive() || !CI.isCI()) {
		confirmed = await confirm(
			`Are you sure you want to delete ${scriptName}? This action cannot be undone.`
		);
	}

	if (confirmed) {
		await fetchResult(
			`/accounts/${accountId}/workers/services/${scriptName}`,
			{ method: "DELETE" },
			new URLSearchParams({ force: "true" })
		);

		logger.log("Successfully deleted", scriptName);
	}

	// TODO: maybe delete sites/assets kv namespace as well?
}
