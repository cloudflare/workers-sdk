import assert from "assert";
import { logRaw } from "@cloudflare/cli";
import { brandColor, gray } from "@cloudflare/cli/colors";
import { defineCommand } from "../../core";
import { UserError } from "../../errors";
import * as metrics from "../../metrics";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchLatestDeployments, fetchVersions } from "../api";
import { getDeploymentSource } from "./utils";
import type { VersionCache } from "../types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

defineCommand({
	command: "wrangler versions deploy list",
	metadata: {
		description: "Displays the 10 most recent deployments of your Worker",
		owner: "Workers: Authoring and Testing",
		status: "open-beta",
	},
	args: {
		name: {
			describe: "Name of the worker",
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
		printBanner: false,
	},
	handler: async function versionsDeploymentsListHandler(args, { config }) {
		if (!args.json) {
			await printWranglerBanner();
		}

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
	},
});
