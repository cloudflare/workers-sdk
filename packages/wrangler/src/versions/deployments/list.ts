import assert from "node:assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, gray } from "@cloudflare/cli/colors";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchLatestDeployments, fetchVersions } from "../api";
import { getVersionSource } from "../list";
import type { ApiDeployment, VersionCache } from "../types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export const deploymentsListCommand = createCommand({
	metadata: {
		description: "Displays the 10 most recent deployments of your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	args: {
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Display output as clean JSON",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	handler: async function versionsDeploymentsListHandler(args, { config }) {
		metrics.sendMetricsEvent(
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
				'You need to provide a name for your Worker. Either pass it as a cli arg with `--name <name>` or in your configuration file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const deployments = (
			await fetchLatestDeployments(config, accountId, workerName)
		).sort((a, b) => a.created_on.localeCompare(b.created_on));

		if (args.json) {
			logRaw(JSON.stringify(deployments, null, 2));
			return;
		}

		const versionCache: VersionCache = new Map();
		const versionIds = deployments.flatMap((d) =>
			d.versions.map((v) => v.version_id)
		);
		await fetchVersions(
			config,
			accountId,
			workerName,
			versionCache,
			...versionIds
		);

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
	},
});

export function getDeploymentSource(deployment: ApiDeployment) {
	return getVersionSource({
		metadata: { source: deployment.source },
		annotations: deployment.annotations,
	});
}
