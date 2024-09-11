import assert from "assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, gray } from "@cloudflare/cli/colors";
import { UserError } from "../../errors";
import * as metrics from "../../metrics";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchLatestDeployments, fetchVersions } from "../api";
import { getConfig, getVersionSource } from "../list";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { ApiDeployment, VersionCache } from "../types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export type VersionsDeloymentsListArgs = StrictYargsOptionsToInterface<
	typeof versionsDeploymentsListOptions
>;

export function versionsDeploymentsListOptions(yargs: CommonYargsArgv) {
	return yargs
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

export async function versionsDeploymentsListHandler(
	args: VersionsDeloymentsListArgs
) {
	if (!args.json) {
		await printWranglerBanner();
	}

	const config = getConfig(args);
	await metrics.sendMetricsEvent(
		"list versioned deployments",
		{ json: args.json },
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

	const deployments = (
		await fetchLatestDeployments(accountId, workerName)
	).sort((a, b) => a.created_on.localeCompare(b.created_on));

	if (args.json) {
		logRaw(JSON.stringify(deployments, null, 2));
		return;
	}

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

export function getDeploymentSource(deployment: ApiDeployment) {
	return getVersionSource({
		metadata: { source: deployment.source },
		annotations: deployment.annotations,
	});
}
