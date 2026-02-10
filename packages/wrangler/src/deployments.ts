import { URLSearchParams } from "node:url";
import {
	configFileName,
	mapWorkerMetadataBindings,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import TOML from "smol-toml";
import { FormData } from "undici";
import { fetchResult } from "./cfetch";
import { readConfig } from "./config";
import { confirm, prompt } from "./dialogs";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import { getScriptName } from "./utils/getScriptName";
import { printWranglerBanner } from "./wrangler-banner";
import type { CommonYargsOptions } from "./yargs-types";
import type {
	ComplianceConfig,
	Config,
	ServiceMetadataRes,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";
import type { ArgumentsCamelCase } from "yargs";

type DeploymentDetails = {
	id: string;
	number: string;
	annotations: {
		"workers/triggered_by": string;
		"workers/rollback_from": string;
		"workers/message": string;
	};
	metadata: {
		author_id: string;
		author_email: string;
		source: "api" | "dash" | "wrangler" | "terraform" | "other";
		created_on: string;
		modified_on: string;
	};
	resources: {
		script: {
			handlers: string[];
		};
		bindings: WorkerMetadataBinding[];
		script_runtime: {
			compatibility_date: string | undefined;
			compatibility_flags: string[] | undefined;
			usage_model: string | undefined;
		};
	};
};

export type DeploymentListResult = {
	latest: DeploymentDetails;
	items: DeploymentDetails[];
};

export async function deployments(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {}
) {
	metrics.sendMetricsEvent(
		"view deployments",
		{ view: scriptName ? "single" : "all" },
		{
			sendMetrics,
		}
	);

	const scriptTag = (
		await fetchResult<ServiceMetadataRes>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${scriptName}`
		)
	).default_environment.script.tag;

	const params = new URLSearchParams({ order: "asc" });
	const { items: deploys } = await fetchResult<DeploymentListResult>(
		complianceConfig,
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
Version ID:    ${versions.id}
Created on:    ${versions.metadata.created_on}
Author:        ${versions.metadata.author_email}
Source:        ${triggerStr}`;

		if (versions.annotations?.["workers/rollback_from"]) {
			version += `\nRollback from: ${versions.annotations["workers/rollback_from"]}`;
		}

		if (versions.annotations?.["workers/message"]) {
			version += `\nMessage:       ${versions.annotations["workers/message"]}`;
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

export async function rollbackDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {},
	deploymentId: string | undefined,
	message: string | undefined
) {
	if (deploymentId === undefined) {
		const scriptTag = (
			await fetchResult<ServiceMetadataRes>(
				complianceConfig,
				`/accounts/${accountId}/workers/services/${scriptName}`
			)
		).default_environment.script.tag;

		const params = new URLSearchParams({ order: "asc" });
		const { items: deploys } = await fetchResult<DeploymentListResult>(
			complianceConfig,
			`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
			undefined,
			params
		);

		if (deploys.length < 2) {
			throw new UserError(
				"Cannot rollback to previous deployment since there are less than 2 deployments",
				{ telemetryMessage: true }
			);
		}

		deploymentId = deploys.at(-2)?.id;
		if (deploymentId === undefined) {
			throw new UserError("Cannot find previous deployment", {
				telemetryMessage: true,
			});
		}
	}

	const firstHash = deploymentId.substring(0, deploymentId.indexOf("-"));

	let rollbackMessage = "";
	if (message !== undefined) {
		rollbackMessage = message;
	} else {
		if (
			!(await confirm(
				`This deployment ${chalk.underline(
					firstHash
				)} will immediately replace the current deployment and become the active deployment across all your deployed routes and domains. However, your local development environment will not be affected by this rollback. ${chalk.blue.bold(
					"Note:"
				)} Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, D1, R2, KV, etc).`
			))
		) {
			return;
		}

		rollbackMessage = await prompt(
			"Please provide a message for this rollback (120 characters max)",
			{ defaultValue: "" }
		);
	}

	let rollbackVersion = await rollbackRequest(
		complianceConfig,
		accountId,
		scriptName,
		deploymentId,
		rollbackMessage
	);

	metrics.sendMetricsEvent(
		"rollback deployments",
		{ view: scriptName ? "single" : "all" },
		{
			sendMetrics,
		}
	);

	deploymentId = addHyphens(deploymentId) ?? deploymentId;
	rollbackVersion = addHyphens(rollbackVersion) ?? rollbackVersion;

	logger.log(`\nSuccessfully rolled back to Deployment ID: ${deploymentId}`);
	logger.log("Current Version ID:", rollbackVersion);
}

async function rollbackRequest(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string | undefined,
	deploymentId: string,
	rollbackReason: string
): Promise<string | null> {
	const body = new FormData();
	body.set("message", rollbackReason);

	const { deployment_id } = await fetchResult<{
		deployment_id: string | null;
	}>(
		complianceConfig,
		`/accounts/${accountId}/workers/scripts/${scriptName}?rollback_to=${deploymentId}`,
		{
			method: "PUT",
			body,
		}
	);

	return deployment_id;
}

export async function viewDeployment(
	complianceConfig: ComplianceConfig,
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {},
	deploymentId: string | undefined
) {
	metrics.sendMetricsEvent(
		"view deployments",
		{ view: scriptName ? "single" : "all" },
		{
			sendMetrics,
		}
	);

	const scriptTag = (
		await fetchResult<ServiceMetadataRes>(
			complianceConfig,
			`/accounts/${accountId}/workers/services/${scriptName}`
		)
	).default_environment.script.tag;

	if (deploymentId === undefined) {
		const params = new URLSearchParams({ order: "asc" });
		const { latest } = await fetchResult<DeploymentListResult>(
			complianceConfig,
			`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
			undefined,
			params
		);

		deploymentId = latest.id;
		if (deploymentId === undefined) {
			throw new UserError("Cannot find previous deployment", {
				telemetryMessage: true,
			});
		}
	}

	const deploymentDetails = await fetchResult<DeploymentListResult["latest"]>(
		complianceConfig,
		`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}/detail/${deploymentId}`
	);

	const triggerStr = deploymentDetails.annotations?.["workers/triggered_by"]
		? `${formatTrigger(
				deploymentDetails.annotations["workers/triggered_by"]
			)} from ${formatSource(deploymentDetails.metadata.source)}`
		: `${formatSource(deploymentDetails.metadata.source)}`;

	const rollbackStr = deploymentDetails.annotations?.["workers/rollback_from"]
		? `\nRollback from:       ${deploymentDetails.annotations["workers/rollback_from"]}`
		: ``;

	const reasonStr = deploymentDetails.annotations?.["workers/message"]
		? `\nMessage:             ${deploymentDetails.annotations["workers/message"]}`
		: ``;

	const compatDateStr = deploymentDetails.resources.script_runtime
		?.compatibility_date
		? `\nCompatibility Date:  ${deploymentDetails.resources.script_runtime?.compatibility_date}`
		: ``;
	const compatFlagsStr = deploymentDetails.resources.script_runtime
		?.compatibility_flags
		? `\nCompatibility Flags: ${deploymentDetails.resources.script_runtime?.compatibility_flags}`
		: ``;

	const bindings = deploymentDetails.resources.bindings;

	const version = `
Version ID:          ${deploymentDetails.id}
Created on:          ${deploymentDetails.metadata.created_on}
Author:              ${deploymentDetails.metadata.author_email}
Source:              ${triggerStr}${rollbackStr}${reasonStr}
------------------------------------------------------------
Author ID:           ${deploymentDetails.metadata.author_id}
Usage Model:         ${deploymentDetails.resources.script_runtime.usage_model}
Handlers:            ${
		deploymentDetails.resources.script.handlers
	}${compatDateStr}${compatFlagsStr}
--------------------------bindings--------------------------
${
	bindings.length > 0
		? TOML.stringify(mapWorkerMetadataBindings(bindings))
		: `None`
}
`;

	logger.log(version);
}

export async function commonDeploymentCMDSetup(
	yargs: ArgumentsCamelCase<CommonYargsOptions>
) {
	await printWranglerBanner();
	const config = readConfig(yargs);
	const accountId = await requireAuth(config);
	const scriptName = getScriptName(
		{ name: yargs.name as string, env: undefined },
		config
	);

	if (!scriptName) {
		throw new UserError(
			`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name\``,
			{
				telemetryMessage: `Required Worker name missing. Please specify the Worker name in your config file, or pass it as an argument with \`--name\``,
			}
		);
	}

	return { accountId, scriptName, config };
}

function addHyphens(uuid: string | null): string | null {
	if (uuid == null) {
		return uuid;
	}

	if (uuid.length != 32) {
		return null;
	}

	const uuid_parts: string[] = [];
	uuid_parts.push(uuid.slice(0, 8));
	uuid_parts.push(uuid.slice(8, 12));
	uuid_parts.push(uuid.slice(12, 16));
	uuid_parts.push(uuid.slice(16, 20));
	uuid_parts.push(uuid.slice(20));

	let hyphenated = "";
	uuid_parts.forEach((part) => (hyphenated += part + "-"));

	return hyphenated.slice(0, 36);
}
