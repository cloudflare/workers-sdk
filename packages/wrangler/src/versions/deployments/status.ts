import assert from "assert";
import path from "path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, dim, gray, white } from "@cloudflare/cli/colors";
import { fetchResult } from "../../cfetch";
import { findWranglerToml, readConfig } from "../../config";
import { UserError } from "../../errors";
import * as metrics from "../../metrics";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { ApiDeployment, ApiVersion } from "../types";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export type VersionsDeploymentsStatusArgs = StrictYargsOptionsToInterface<
	typeof versionsDeploymentsStatusOptions
>;

export function versionsDeploymentsStatusOptions(yargs: CommonYargsArgv) {
	return yargs.option("name", {
		describe: "Name of the worker",
		type: "string",
		requiresArg: true,
	});
}

export async function versionsDeploymentsStatusHandler(
	args: VersionsDeploymentsStatusArgs
) {
	await printWranglerBanner();

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"view latest versioned deployment",
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

	const { deployments } = await fetchResult<{
		deployments: ApiDeployment[];
	}>(`/accounts/${accountId}/workers/scripts/${workerName}/deployments`);

	const latestDeployment = deployments.at(0);

	if (!latestDeployment) {
		throw new UserError(`The worker ${workerName} has no deployments.`);
	}

	const versionIds = latestDeployment.versions.map((v) => v.version_id);
	const versions = await Promise.all(
		versionIds.map((versionId) =>
			fetchResult<ApiVersion>(
				`/accounts/${accountId}/workers/scripts/${workerName}/versions/${versionId}`
			)
		)
	);
	const versionsById = new Map(
		versions.map((version) => [version.id, version])
	);

	const formattedVersions = latestDeployment.versions.map((traffic) => {
		const version = versionsById.get(traffic.version_id);
		assert(version);

		const percentage = brandColor(`(${traffic.percentage}%)`);
		const details = formatLabelledValues(
			{
				Created: new Date(version.metadata["created_on"]).toISOString(),
				Tag: version.annotations?.["workers/tag"] || BLANK_INPUT,
				Message: version.annotations?.["workers/message"] || BLANK_INPUT,
			},
			{
				indentationCount: 4,
				labelJustification: "right",
				formatLabel: (label) => gray(label + ":"),
				formatValue: (value) => gray(value),
			}
		);

		return `${percentage} ${version.id}\n${details}`;
	});

	const formattedDeployment = formatLabelledValues({
		// explicitly not outputting Deployment ID
		Created: new Date(latestDeployment.created_on).toISOString(),
		Author: latestDeployment.author_email,
		Source: latestDeployment.source,
		Message: latestDeployment.annotations?.["workers/message"] || BLANK_INPUT,
		"Version(s)": formattedVersions.join("\n\n"),
	});

	logRaw(formattedDeployment);
}

function getConfig(
	args: Pick<
		VersionsDeploymentsStatusArgs,
		"config" | "name" | "experimentalJsonConfig"
	>
) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	const config = readConfig(configPath, args);

	return config;
}
