import assert from "assert";
import path from "path";
import { logRaw } from "@cloudflare/cli";
import { brandColor, gray } from "@cloudflare/cli/colors";
import { findWranglerToml, readConfig } from "../../config";
import { UserError } from "../../errors";
import * as metrics from "../../metrics";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchLatestDeployment, fetchVersions } from "../api";
import { VersionCache } from "../types";
import { getDeploymentSource } from "./list";
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
			'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`'
		);
	}

	const latestDeployment = await fetchLatestDeployment(accountId, workerName);

	if (!latestDeployment) {
		throw new UserError(`The worker ${workerName} has no deployments.`);
	}

	const versionCache: VersionCache = new Map();
	const versionIds = latestDeployment.versions.map((v) => v.version_id);
	await fetchVersions(accountId, workerName, versionCache, ...versionIds);

	const formattedVersions = latestDeployment.versions.map((traffic) => {
		const version = versionCache.get(traffic.version_id);
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
		Source: getDeploymentSource(latestDeployment),
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
