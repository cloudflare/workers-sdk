import { URLSearchParams } from "url";
import { fetchResult, fetchScriptContent } from "./cfetch";
import { logger } from "./logger";
import * as metrics from "./metrics";
import type { Config } from "./config";
import type { ServiceMetadataRes } from "./init";

export type DeploymentListRes = {
	latest: {
		id: string;
		number: string;
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
	items: {
		id: string;
		number: string;
		metadata: {
			author_id: string;
			author_email: string;
			source: "api" | "dash" | "wrangler" | "terraform" | "other";
			created_on: string;
			modified_on: string;
		};
	}[];
};

export async function deployments(
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {},
	deploymentId: string
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

	const scriptTag = (
		await fetchResult<ServiceMetadataRes>(
			`/accounts/${accountId}/workers/services/${scriptName}`
		)
	).default_environment.script.tag;

	if (deploymentId) {
		const scriptContent = await fetchScriptContent(
			`/accounts/${accountId}/workers/scripts/${scriptName}?deployment=${deploymentId}`
		);
		const deploymentDetails = await fetchResult<DeploymentListRes["latest"]>(
			`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}/detail/${deploymentId}`
		);

		const flatObj: Record<string, unknown> = {};
		for (const deployDetailsKey in deploymentDetails) {
			if (
				Object.prototype.hasOwnProperty.call(
					deploymentDetails,
					deployDetailsKey
				)
			) {
				//@ts-expect-error flattening objects causes the index signature to error
				const value = deploymentDetails[deployDetailsKey];
				if (typeof value === "object" && value !== null) {
					for (const subKey in value) {
						if (Object.prototype.hasOwnProperty.call(value, subKey)) {
							flatObj[`${deployDetailsKey}.${subKey}`] = value[subKey];
						}
					}
				} else {
					flatObj[deployDetailsKey] = value;
				}
			}
		}

		logger.log(flatObj);
		logger.log(scriptContent);

		// early return to skip the deployments listings
		return;
	}

	const params = new URLSearchParams({ order: "asc" });
	const { items: deploys } = await fetchResult<DeploymentListRes>(
		`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
		undefined,
		params
	);

	const versionMessages = deploys.map(
		(versions) =>
			`\nDeployment ID: ${versions.id}
Created on: ${versions.metadata.created_on}
Author: ${versions.metadata.author_email}
Source: ${sourceStr(versions.metadata.source)}\n`
	);

	versionMessages[versionMessages.length - 1] += "🟩 Active";
	logger.log(...versionMessages);
}

function sourceStr(source: string): string {
	switch (source) {
		case "api":
			return "📡 API";
		case "dash":
			return "🖥️ Dashboard";
		case "wrangler":
			return "🤠 Wrangler";
		case "terraform":
			return "🏗️ Terraform";
		default:
			return "Other";
	}
}
