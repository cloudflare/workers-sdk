import { logRaw } from "@cloudflare/cli";
import { UserError } from "../errors";
import * as metrics from "../metrics";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import formatLabelledValues from "../utils/render-labelled-values";
import { fetchVersion } from "./api";
import { getConfig, getVersionSource } from "./list";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export type VersionsViewArgs = StrictYargsOptionsToInterface<
	typeof versionsViewOptions
>;

export function versionsViewOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("version-id", {
			describe: "The Worker Version ID to view",
			type: "string",
			requiresArg: true,
			demandOption: true,
		})
		.option("name", {
			describe: "Name of the worker",
			type: "string",
			requiresArg: true,
		})
		.option("json", {
			describe: "Display output as clean JSON",
			type: "boolean",
			default: false,
		});
}

export async function versionsViewHandler(args: VersionsViewArgs) {
	if (!args.json) {
		await printWranglerBanner();
	}

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"view worker version",
		{},
		{
			sendMetrics: config.send_metrics,
		}
	);

	const accountId = await requireAuth(config);
	const workerName = args.name ?? config.name;

	if (workerName === undefined) {
		throw new UserError(
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	const version = await fetchVersion(accountId, workerName, args.versionId);

	if (args.json) {
		logRaw(JSON.stringify(version, null, 2));
		return;
	}

	const formattedVersion = formatLabelledValues({
		"Version ID": version.id,
		Created: new Date(version.metadata["created_on"]).toISOString(),
		Author: version.metadata.author_email,
		Source: getVersionSource(version),
		Tag: version.annotations?.["workers/tag"] || BLANK_INPUT,
		Message: version.annotations?.["workers/message"] || BLANK_INPUT,
	});

	logRaw(formattedVersion);
}
