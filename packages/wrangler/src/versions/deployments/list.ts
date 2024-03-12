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
import {
	fetchLatestDeployment,
	fetchLatestDeployments,
	fetchVersions,
} from "../api";
import { getVersionSource } from "../list";
import { ApiDeployment, VersionCache } from "../types";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export type VersionsDeloymentsListArgs = StrictYargsOptionsToInterface<
	typeof versionsDeploymentsListOptions
>;

export function versionsDeploymentsListOptions(yargs: CommonYargsArgv) {
	return yargs.option("name", {
		describe: "Name of the worker",
		type: "string",
		requiresArg: true,
	});
}

export async function versionsDeploymentsListHandler(
	args: VersionsDeloymentsListArgs
) {
	await printWranglerBanner();

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"list versioned deployments",
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

	const deployments = await fetchLatestDeployments(accountId, workerName);
	const versionCache: VersionCache = new Map();
	const versionIds = deployments.flatMap((d) =>
		d.versions.map((v) => v.version_id)
	);
	await fetchVersions(accountId, workerName, versionCache, ...versionIds);

	const formattedDeployments = deployments.map((deployment) => {
		const formattedVersions = deployment.versions.map((traffic) => {
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

		return formatLabelledValues({
			// explicitly not outputting Deployment ID
			Created: new Date(deployment.created_on).toISOString(),
			Author: deployment.author_email,
			Source: getDeploymentSource(deployment),
			Message: deployment.annotations?.["workers/message"] || BLANK_INPUT,
			"Version(s)": formattedVersions.join("\n\n"),
		});
	});

	logRaw(formattedDeployments.join("\n\n"));
}

function getConfig(
	args: Pick<
		VersionsDeloymentsListArgs,
		"config" | "name" | "experimentalJsonConfig"
	>
) {
	const configPath =
		args.config || (args.name && findWranglerToml(path.dirname(args.name)));
	const config = readConfig(configPath, args);

	return config;
}

export function getDeploymentSource(deployment: ApiDeployment) {
	return getVersionSource({
		metadata: { source: deployment.source },
		annotations: deployment.annotations,
	});
}
