import { URLSearchParams } from "url";
import TOML from "@iarna/toml";
import chalk from "chalk";
import { FormData } from "undici";
import { fetchResult } from "./cfetch";
import { readConfig } from "./config";
import { confirm, prompt } from "./dialogs";
import { mapBindings } from "./init";
import { logger } from "./logger";
import * as metrics from "./metrics";
import { requireAuth } from "./user";
import { getScriptName, printWranglerBanner } from ".";

import type { Config } from "./config";
import type { WorkerMetadataBinding } from "./create-worker-upload-form";
import type { ServiceMetadataRes } from "./init";
import type { CommonYargsOptions } from "./yargs-types";
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

	const scriptTag = (
		await fetchResult<ServiceMetadataRes>(
			`/accounts/${accountId}/workers/services/${scriptName}`
		)
	).default_environment.script.tag;

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
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {},
	deploymentId: string | undefined,
	message: string | undefined
) {
	if (deploymentId === undefined) {
		const scriptTag = (
			await fetchResult<ServiceMetadataRes>(
				`/accounts/${accountId}/workers/services/${scriptName}`
			)
		).default_environment.script.tag;

		const params = new URLSearchParams({ order: "asc" });
		const { items: deploys } = await fetchResult<DeploymentListResult>(
			`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
			undefined,
			params
		);

		if (deploys.length < 2) {
			throw new Error(
				"Cannot rollback to previous deployment since there are less than 2 deployemnts"
			);
		}

		deploymentId = deploys.at(-2)?.id;
		if (deploymentId === undefined) {
			throw new Error("Cannot find previous deployment");
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
				)} Rolling back to a previous deployment will not rollback any of the bound resources (Durable Object, R2, KV, etc.).`
			))
		) {
			return;
		}

		rollbackMessage = await prompt(
			"Please provide a message for this rollback (120 characters max)",
			{ defaultValue: "" }
		);
	}

	let deployment_id = await rollbackRequest(
		accountId,
		scriptName,
		deploymentId,
		rollbackMessage
	);

	await metrics.sendMetricsEvent(
		"rollback deployments",
		{ view: scriptName ? "single" : "all" },
		{
			sendMetrics,
		}
	);

	deploymentId = addHyphens(deploymentId) ?? deploymentId;
	deployment_id = addHyphens(deployment_id) ?? deployment_id;

	logger.log(`\nSuccessfully rolled back to Deployment ID: ${deploymentId}`);
	logger.log("Current Deployment ID:", deployment_id);
}

async function rollbackRequest(
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
		`/accounts/${accountId}/workers/scripts/${scriptName}?rollback_to=${deploymentId}`,
		{
			method: "PUT",
			body,
		}
	);

	return deployment_id;
}

export async function viewDeployment(
	accountId: string,
	scriptName: string | undefined,
	{ send_metrics: sendMetrics }: { send_metrics?: Config["send_metrics"] } = {},
	deploymentId: string | undefined
) {
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

	if (deploymentId === undefined) {
		const params = new URLSearchParams({ order: "asc" });
		const { latest } = await fetchResult<DeploymentListResult>(
			`/accounts/${accountId}/workers/deployments/by-script/${scriptTag}`,
			undefined,
			params
		);

		deploymentId = latest.id;
		if (deploymentId === undefined) {
			throw new Error("Cannot find previous deployment");
		}
	}

	const deploymentDetails = await fetchResult<DeploymentListResult["latest"]>(
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
Deployment ID:       ${deploymentDetails.id}
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
		? TOML.stringify(mapBindings(bindings) as TOML.JsonMap)
		: `None`
}
`;

	logger.log(version);

	// early return to skip the deployments listings
	return;
}

export async function commonDeploymentCMDSetup(
	yargs: ArgumentsCamelCase<CommonYargsOptions>,
	deploymentsWarning: string
) {
	await printWranglerBanner();
	const config = readConfig(yargs.config, yargs);
	const accountId = await requireAuth(config);
	const scriptName = getScriptName(
		{ name: yargs.name as string, env: undefined },
		config
	);

	logger.log(`${deploymentsWarning}\n`);

	return { accountId, scriptName, config };
}

export function addHyphens(uuid: string | null): string | null {
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
