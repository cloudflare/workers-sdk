import assert from "node:assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, gray } from "@cloudflare/cli/colors";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchLatestDeployment, fetchVersions } from "../api";
import { getDeploymentSource } from "./list";
import type { VersionCache } from "../types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export const deploymentsStatusCommand = createCommand({
	metadata: {
		description: "View the current state of your production",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		logArgs: true,
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
	handler: async function versionsDeploymentsStatusHandler(args, { config }) {
		metrics.sendMetricsEvent("view latest versioned deployment", {
			sendMetrics: config.send_metrics,
		});

		const accountId = await requireAuth(config);
		const workerName = args.name ?? config.name;

		if (workerName === undefined) {
			throw new UserError(
				'You need to provide a name for your Worker. Either pass it as a cli arg with `--name <name>` or in your configuration file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const latestDeployment = await fetchLatestDeployment(
			config,
			accountId,
			workerName
		);

		if (!latestDeployment) {
			throw new UserError(`The Worker ${workerName} has no deployments.`, {
				telemetryMessage: "The Worker has no deployments",
			});
		}

		if (args.json) {
			logRaw(JSON.stringify(latestDeployment, null, 2));
			return;
		}

		const versionCache: VersionCache = new Map();
		const versionIds = latestDeployment.versions.map((v) => v.version_id);
		await fetchVersions(
			config,
			accountId,
			workerName,
			versionCache,
			...versionIds
		);

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
	},
});
