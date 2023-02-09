import { URLSearchParams } from "url";
import { fetchResult } from "./cfetch";
import { logger } from "./logger";
import * as metrics from "./metrics";
import type { Config } from "./config";
import type { ServiceMetadataRes } from "./init";

type DeploymentDetails = {
	id: string;
	number: string;
	annotations: {
		"workers/triggered_by": string;
		"workers/rollback_from": string;
	};
	metadata: {
		author_id: string;
		author_email: string;
		source: "api" | "dash" | "wrangler" | "terraform" | "other";
		created_on: string;
		modified_on: string;
	};
	resources: {
		script: string;
		bindings: unknown[];
	};
};

export type DeploymentListResult = {
	latest: DeploymentDetails;
	items: DeploymentDetails[];
};

export async function deployments(
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {}
) {
	if (!scriptName) {
		throw new Error(
			"Required Worker name missing. Please specify the Worker name in wrangler.toml, or pass it as an argument with `--name`"
		);
	}

	await metrics.sendMetricsEvent(
		"view deployments",
		{ view: scriptName ? "single" : "all" },
		{
			sendMetrics,
		}
	);

	const scriptMetadata = await fetchResult<ServiceMetadataRes>(
		`/accounts/${accountId}/workers/services/${scriptName}`
	);

	const scriptTag = scriptMetadata.default_environment.script.tag;
	const params = new URLSearchParams({ order: "asc" });
	const { items: deploys } = await fetchResult<DeploymentListResult>(
		`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
		undefined,
		params
	);

	const versionMessages = deploys.map((versions) => {
		const triggerStr = versions.annotations?.["workers/triggered_by"]
			? `${formatTrigger(
					versions.annotations["workers/triggered_by"]
			  )} from ${formatSource(versions.metadata.source)}`
			: `${formatSource(versions.metadata.source)}`;

		let version = `
Deployment ID: ${versions.id}
Created on:    ${versions.metadata.created_on}
Author:        ${versions.metadata.author_email}
Trigger:       ${triggerStr}`;

		if (versions.annotations?.["workers/rollback_from"]) {
			version += `\nRollback from: ${versions.annotations["workers/rollback_from"]}`;
		}

		return version + `\n`;
	});

	versionMessages[versionMessages.length - 1] += "🟩 Active";
	logger.log(...versionMessages);
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
			return "Other";
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
			return "Unknown";
	}
}
