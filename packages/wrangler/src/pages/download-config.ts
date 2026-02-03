import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { formatCompatibilityDate, supportedCompatibilityDate } from "miniflare";
import TOML from "smol-toml";
import { fetchResult } from "../cfetch";
import { getConfigCache } from "../config-cache";
import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import type { PagesConfigCache } from "./types";
import type { Project } from "@cloudflare/types";
import type { RawEnvironment } from "@cloudflare/workers-utils";

// TODO: fix the Project definition
type DeploymentConfig = Project["deployment_configs"]["production"];
interface PagesDeploymentConfig extends DeploymentConfig {
	services: Record<
		string,
		{
			service: string;
			environment?: string;
		}
	>;
	queue_producers: Record<
		string,
		{
			name: string;
		}
	>;
	analytics_engine_datasets: Record<
		string,
		{
			dataset: string;
		}
	>;
	durable_object_namespaces: Record<
		string,
		{
			namespace_id: string;
			class_name: string;
			service: string;
			environment: string;
		}
	>;
	ai_bindings: Record<string, Record<string, never>>;
	limits?: {
		cpu_ms: number;
	};
	placement?: {
		mode: "smart";
	};
	wrangler_config_hash?: string;
}

export interface PagesProject extends Project {
	deployment_configs: {
		production: PagesDeploymentConfig;
		preview: PagesDeploymentConfig;
	};
}

async function toEnvironment(
	deploymentConfig: PagesDeploymentConfig,
	accountId: string
): Promise<RawEnvironment> {
	const configObj = {} as RawEnvironment;
	configObj.compatibility_date =
		deploymentConfig.compatibility_date ?? formatCompatibilityDate(new Date());

	// Find the latest supported compatibility date and use that
	if (deploymentConfig.always_use_latest_compatibility_date) {
		configObj.compatibility_date = supportedCompatibilityDate;
	}

	if (deploymentConfig.compatibility_flags?.length) {
		configObj.compatibility_flags = deploymentConfig.compatibility_flags;
	}

	if (deploymentConfig.placement) {
		configObj.placement = deploymentConfig.placement;
	} else {
		configObj.placement = { mode: "off" };
	}
	if (deploymentConfig.limits) {
		configObj.limits = deploymentConfig.limits;
	}

	for (const [name, envVar] of Object.entries(
		deploymentConfig.env_vars ?? {}
	)) {
		if (envVar?.value && envVar?.type == "plain_text") {
			configObj.vars ??= {};
			configObj.vars[name] = envVar?.value;
		}
	}

	for (const [name, namespace] of Object.entries(
		deploymentConfig.kv_namespaces ?? {}
	)) {
		configObj.kv_namespaces ??= [];
		configObj.kv_namespaces.push({ id: namespace.namespace_id, binding: name });
	}

	for (const [name, ns] of Object.entries(
		deploymentConfig.durable_object_namespaces ?? {}
	)) {
		configObj.durable_objects ??= { bindings: [] };
		if (ns.class_name && ns.class_name !== "") {
			configObj.durable_objects.bindings.push({
				name: name,
				class_name: ns.class_name,
				script_name: ns.service,
				environment: ns.environment,
			});
		} else {
			const namespace = await fetchResult<{
				script: string;
				class: string;
				environment?: string;
			}>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/workers/durable_objects/namespaces/${ns.namespace_id}`
			);
			configObj.durable_objects.bindings.push({
				name: name,
				class_name: namespace.class,
				script_name: namespace.script,
				environment: namespace.environment,
			});
		}
	}

	for (const [name, namespace] of Object.entries(
		deploymentConfig.d1_databases ?? {}
	)) {
		configObj.d1_databases ??= [];
		configObj.d1_databases.push({
			database_id: namespace.id,
			binding: name,
			database_name: name,
		});
	}

	for (const [name, bucket] of Object.entries(
		deploymentConfig.r2_buckets ?? {}
	)) {
		configObj.r2_buckets ??= [];
		configObj.r2_buckets.push({
			bucket_name: bucket.name,
			binding: name,
		});
	}

	for (const [name, { service, environment }] of Object.entries(
		deploymentConfig.services ?? {}
	)) {
		configObj.services ??= [];
		configObj.services.push({
			binding: name,
			service,
			environment,
		});
	}

	for (const [name, queue] of Object.entries(
		deploymentConfig.queue_producers ?? {}
	)) {
		configObj.queues ??= { producers: [] };
		configObj.queues?.producers?.push({
			binding: name,
			queue: queue.name,
		});
	}

	for (const [name, { dataset }] of Object.entries(
		deploymentConfig.analytics_engine_datasets ?? {}
	)) {
		configObj.analytics_engine_datasets ??= [];
		configObj.analytics_engine_datasets.push({
			binding: name,
			dataset,
		});
	}
	for (const [name] of Object.entries(deploymentConfig.ai_bindings ?? {})) {
		configObj.ai = { binding: name };
	}
	return configObj;
}
async function writeWranglerToml(toml: RawEnvironment) {
	let tomlString = TOML.stringify(toml);

	// Remove indentation from the start of lines, as this isn't common across TOML examples, and causes user confusion
	tomlString = tomlString
		.split("\n")
		.map((line) => line.trimStart())
		.join("\n");

	// Pages does not support custom Wrangler configuration locations, so always write to ./wrangler.toml
	// TODO(soon): Change this to `wrangler.json` once we've bumped Wrangler in Pages CI
	await writeFile(
		"wrangler.toml",
		`# Generated by Wrangler on ${new Date()}\n${tomlString}`
	);
}

function simplifyEnvironments(
	preview: RawEnvironment,
	production: RawEnvironment
): {
	topLevel: RawEnvironment;
	preview?: RawEnvironment;
	production: RawEnvironment;
} {
	const topLevel = { ...preview };
	// Remove duplication for inheritable keys (https://developers.cloudflare.com/pages/functions/wrangler-configuration/#inheritable-keys)
	if (preview.compatibility_date === production.compatibility_date) {
		delete production.compatibility_date;
		delete preview.compatibility_date;
	}
	if (
		JSON.stringify(preview.compatibility_flags) ===
		JSON.stringify(production.compatibility_flags)
	) {
		delete production.compatibility_flags;
		delete preview.compatibility_date;
	}

	if (
		JSON.stringify(preview.placement) === JSON.stringify(production.placement)
	) {
		delete production.placement;
		delete preview.placement;

		// Don't include extraneous placement
		if (topLevel.placement?.mode === "off") {
			delete topLevel.placement;
		}
	}
	if (JSON.stringify(preview.limits) === JSON.stringify(production.limits)) {
		delete production.limits;
		delete preview.limits;
		return { topLevel, production };
	}
	// At this point, we've simplified the environments as much as possible, and could ideally use `preview` for the top-level default and `production` as a named override if necessary
	// However, this relies on the `production` named environment fully specifying all it's properties, which is not always the case. `limits` can be unset in a
	// Pages environment, and if `preview` (i.e. the top level) sets a `limits` value the named `prodution` environment would inherit it, with no way to unset it (as there is for `placement` with `mode: "off"`, for instance)
	// As such, if `preview` sets `limits` and `production` _doesn't_, make a named environment for both `preview` and `production`, and copy every other property from `preview` to the top-level for use locally
	else if (preview.limits && !production.limits) {
		delete topLevel.limits;
		return { topLevel, production, preview };
	}
	return { topLevel, production };
}

async function downloadProject(accountId: string, projectName: string) {
	const project = await fetchResult<PagesProject>(
		COMPLIANCE_REGION_CONFIG_PUBLIC,
		`/accounts/${accountId}/pages/projects/${projectName}`
	);
	logger.debug(JSON.stringify(project, null, 2));

	const { topLevel, preview, production } = simplifyEnvironments(
		await toEnvironment(project.deployment_configs.preview, accountId),
		await toEnvironment(project.deployment_configs.production, accountId)
	);

	return {
		name: project.name,
		pages_build_output_dir: project.build_config.destination_dir,
		...topLevel,
		...{
			env: preview
				? {
						preview,
						production,
					}
				: {
						production,
					},
		},
	};
}

export const pagesDownloadConfigCommand = createCommand({
	metadata: {
		description:
			"Download your Pages project config as a Wrangler configuration file",
		status: "experimental",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		projectName: {
			type: "string",
			description: "The Pages project to download",
		},
		force: {
			description:
				"Overwrite an existing Wrangler configuration file without prompting",
			type: "boolean",
		},
	},
	positionalArgs: ["projectName"],
	async handler({ projectName, force }) {
		void metrics.sendMetricsEvent("download pages config");

		const projectConfig = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const accountId = await requireAuth(projectConfig);

		projectName ??= projectConfig.project_name;

		if (!projectName) {
			throw new FatalError("Must specify a project name.", 1);
		}
		const config = await downloadProject(accountId, projectName);
		if (!force && existsSync("wrangler.toml")) {
			const overwrite = await confirm(
				"Your existing Wrangler configuration file will be overwritten. Continue?",
				{ fallbackValue: false }
			);
			if (!overwrite) {
				throw new FatalError(
					"Not overwriting existing Wrangler configuration file"
				);
			}
		}
		await writeWranglerToml(config);
		logger.info(
			chalk.green(
				"Success! Your project settings have been downloaded to wrangler.toml"
			)
		);
	},
});
