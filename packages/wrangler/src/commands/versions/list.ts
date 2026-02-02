import { logRaw } from "@cloudflare/cli";
import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import formatLabelledValues from "../../utils/render-labelled-values";
import { fetchDeployableVersions } from "./api";
import type { ApiVersion, VersionCache } from "./types";

const BLANK_INPUT = "-"; // To be used where optional user-input is displayed and the value is nullish

export const versionsListCommand = createCommand({
	metadata: {
		description: "List the 10 most recent Versions of your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printBanner: (args) => !args.json,
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
	handler: async function versionsListHandler(args, { config }) {
		metrics.sendMetricsEvent(
			"list worker versions",
			{ json: args.json },
			{
				sendMetrics: config.send_metrics,
			}
		);

		const accountId = await requireAuth(config);
		const workerName = args.name ?? config.name;

		if (workerName === undefined) {
			throw new UserError(
				'You need to provide a name of your worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		const versionCache: VersionCache = new Map();
		const versions = (
			await fetchDeployableVersions(config, accountId, workerName, versionCache)
		).sort((a, b) =>
			a.metadata.created_on.localeCompare(b.metadata.created_on)
		);

		if (args.json) {
			logRaw(JSON.stringify(versions, null, 2));
			return;
		}

		for (const version of versions) {
			const formattedVersion = formatLabelledValues({
				"Version ID": version.id,
				Created: new Date(version.metadata["created_on"]).toISOString(),
				Author: version.metadata.author_email,
				Source: getVersionSource(version),
				Tag: version.annotations?.["workers/tag"] || BLANK_INPUT,
				Message: version.annotations?.["workers/message"] || BLANK_INPUT,
			});

			logRaw(formattedVersion);
			logRaw(``);
		}
	},
});

export function getVersionSource(version: {
	metadata: Pick<ApiVersion["metadata"], "source">;
	annotations?: Pick<
		NonNullable<ApiVersion["annotations"]>,
		"workers/triggered_by"
	>;
}) {
	return version.annotations?.["workers/triggered_by"] === undefined
		? formatSource(version.metadata.source)
		: formatTrigger(version.annotations["workers/triggered_by"]);
}

function formatSource(source: string): string {
	switch (source) {
		case "api":
			return "API 📡";
		case "dash":
			return "Dashboard 🖥️";
		case "wrangler":
			return "Wrangler 🤠";
		case "terraform":
			return "Terraform 🏗️";
		default:
			return `Other (${source})`;
	}
}
function formatTrigger(trigger: string): string {
	switch (trigger) {
		case "upload":
			return "Upload";
		case "secret":
			return "Secret Change";
		case "rollback":
			return "Rollback";
		case "promotion":
			return "Promotion";
		default:
			return `Unknown (${trigger})`;
	}
}
