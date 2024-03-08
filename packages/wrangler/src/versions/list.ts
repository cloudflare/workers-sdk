import path from "path";
import * as cli from "@cloudflare/cli";
import { fetchResult } from "../cfetch";
import { findWranglerToml, readConfig } from "../config";
import { UserError } from "../errors";
import * as metrics from "../metrics";
import { printWranglerBanner } from "../update-check";
import { requireAuth } from "../user";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export type VersionsListArgs = StrictYargsOptionsToInterface<
	typeof versionsListOptions
>;

type UUID = string;
type VersionId = UUID;
type ApiVersion = {
	id: VersionId;
	number: number;
	metadata: {
		created_on: string;
		modified_on: string;
		source: "api" | string;
		author_id: string;
		author_email: string;
	};
	annotations?: Record<string, string> & {
		"workers/triggered_by"?: "upload" | string;
		"workers/message"?: string;
		"workers/tag"?: string;
	};
	// other properties not typed as not used
};

export function versionsListOptions(yargs: CommonYargsArgv) {
	return yargs.option("name", {
		describe: "Name of the worker",
		type: "string",
		requiresArg: true,
	});
}

export async function versionsListHandler(args: VersionsListArgs) {
	await printWranglerBanner();

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"list worker versions",
		{},
		{
			sendMetrics: config.send_metrics,
		}
	);

	const accountId = await requireAuth(config);
	const workerName = args.name ?? config.name;

	if (workerName === undefined) {
		throw new UserError(
			'You need to provide a name when deploying a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	const { items: versions } = await fetchResult<{ items: ApiVersion[] }>(
		`/accounts/${accountId}/workers/scripts/${workerName}/versions`
	);

	for (const version of versions) {
		const view = {
			"Version ID": version.id,
			Created: new Date(version.metadata["created_on"]).toLocaleString(),
			Author: version.metadata.author_email,
			Source: version.metadata.source,
			Tag: version.annotations?.["workers/tag"] ?? BLANK_INPUT,
			Message: version.annotations?.["workers/message"] ?? BLANK_INPUT,
		};

		const alignment = 17;
		for (const [label, value] of Object.entries(view)) {
			const paddedLabel = `${label}:`.padEnd(alignment);
			const alignedValue = value
				?.split("\n")
				.map((line, lineNo) =>
					lineNo === 0 ? line : " ".repeat(alignment) + line
				)
				.join("\n");

			cli.logRaw(paddedLabel + alignedValue);
		}

		cli.logRaw(``);
	}
}

function getConfig(
	args: Pick<VersionsListArgs, "config" | "name" | "experimentalJsonConfig">
) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	const config = readConfig(configPath, args);

	return config;
}
