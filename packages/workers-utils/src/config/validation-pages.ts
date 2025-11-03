/**
 * Pages now supports configuration via a Wrangler configuration file. As opposed to
 * Workers however, Pages only supports a limited subset of all available
 * configuration keys.
 *
 * This file contains all Wrangler configuration file validation things, specific to
 * Pages.
 */

import { FatalError } from "../errors";
import { defaultWranglerConfig } from "./config";
import { Diagnostics } from "./diagnostics";
import { isRequiredProperty } from "./validation-helpers";
import type { Config } from "./config";

const supportedPagesConfigFields = [
	"pages_build_output_dir",
	"name",
	"compatibility_date",
	"compatibility_flags",
	"send_metrics",
	"no_bundle",
	"limits",
	"placement",
	"vars",
	"durable_objects",
	"kv_namespaces",
	"queues", // `producers` ONLY
	"r2_buckets",
	"d1_databases",
	"vectorize",
	"hyperdrive",
	"services",
	"analytics_engine_datasets",
	"ai",
	"version_metadata",
	"dev",
	"mtls_certificates",
	"browser",
	"upload_source_maps",
	// normalizeAndValidateConfig() sets these values
	"configPath",
	"userConfigPath",
	"topLevelName",
	"definedEnvironments",
	"targetEnvironment",
] as const;

export function validatePagesConfig(
	config: Config,
	envNames: string[],
	projectName?: string
): Diagnostics {
	// exhaustive check
	if (!config.pages_build_output_dir) {
		throw new FatalError(`Attempting to validate Pages configuration file, but "pages_build_output_dir" field was not found.
		"pages_build_output_dir" is required for Pages projects.`);
	}

	const diagnostics = new Diagnostics(
		`Running configuration file validation for Pages:`
	);

	validateMainField(config, diagnostics);
	validateProjectName(projectName, diagnostics);
	validatePagesEnvironmentNames(envNames, diagnostics);
	validateUnsupportedFields(config, diagnostics);
	validateDurableObjectBinding(config, diagnostics);

	return diagnostics;
}

/**
 * Validate that configuration file doesn't specify "main", if
 * "pages_build_output_dir" is present
 */
function validateMainField(config: Config, diagnostics: Diagnostics) {
	if (config.main !== undefined) {
		diagnostics.errors.push(
			`Configuration file cannot contain both both "main" and "pages_build_output_dir" configuration keys.\n` +
				`Please use "main" if you are deploying a Worker, or "pages_build_output_dir" if you are deploying a Pages project.`
		);
	}
}

/**
 * Validate that "name" field is specified at the top-level
 */
function validateProjectName(
	name: string | undefined,
	diagnostics: Diagnostics
) {
	if (name === undefined || name.trim() === "") {
		diagnostics.errors.push(
			`Missing top-level field "name" in configuration file.\n` +
				`Pages requires the name of your project to be configured at the top-level of your Wrangler configuration file. This is because, in Pages, environments target the same project.`
		);
	}
}

/**
 * Validate that no named-environments other than "preview" and "production"
 * were specified in the configuration file for Pages
 */
function validatePagesEnvironmentNames(
	envNames: string[],
	diagnostics: Diagnostics
) {
	if (!envNames?.length) {
		return;
	}

	const unsupportedPagesEnvNames = envNames.filter(
		(name) => name !== "preview" && name !== "production"
	);

	if (unsupportedPagesEnvNames.length > 0) {
		diagnostics.errors.push(
			`Configuration file contains the following environment names that are not supported by Pages projects:\n` +
				`${unsupportedPagesEnvNames.map((name) => `"${name}"`).join()}.\n` +
				`The supported named-environments for Pages are "preview" and "production".`
		);
	}
}

/**
 * Check for configuration fields that are not supported by Pages via the
 * configuration file
 */
function validateUnsupportedFields(config: Config, diagnostics: Diagnostics) {
	const unsupportedFields = new Set(Object.keys(config) as Array<keyof Config>);

	for (const field of supportedPagesConfigFields) {
		// Pages config supports  `queues.producers` only. However, let's skip
		// that validation here and keep all diagnostics handling in one place.
		// This way we'll avoid breaking the config key logical grouping in
		// `supportedPagesConfigFields`, when writing the errors to stdout.
		if (field === "queues" && config.queues?.consumers?.length) {
			continue;
		}

		unsupportedFields.delete(field);
	}

	for (const field of unsupportedFields) {
		// check for unsupported fields with default values and exclude if found.
		// These were most likely set as part of `normalizeAndValidateConfig()`
		// processing, and not via the config file.
		if (
			config[field] === undefined ||
			JSON.stringify(config[field]) ===
				JSON.stringify(defaultWranglerConfig[field])
		) {
			unsupportedFields.delete(field);
		}
	}

	if (unsupportedFields.size > 0) {
		const fields = Array.from(unsupportedFields.keys());

		fields.forEach((field) => {
			if (field === "queues" && config.queues?.consumers?.length) {
				diagnostics.errors.push(
					`Configuration file for Pages projects does not support "queues.consumers"`
				);
			} else {
				diagnostics.errors.push(
					`Configuration file for Pages projects does not support "${field}"`
				);
			}
		});
	}
}

/**
 * Validate the "script_name" field is specified for [[durable_objects.bindings]]
 *
 * This is necessary because Pages cannot define/deploy a DO itself today,
 * and so this needs to be done with a Worker.
 */
function validateDurableObjectBinding(
	config: Config,
	diagnostics: Diagnostics
) {
	if (config.durable_objects.bindings.length > 0) {
		const invalidBindings = config.durable_objects.bindings.filter(
			(binding) => !isRequiredProperty(binding, "script_name", "string")
		);
		if (invalidBindings.length > 0) {
			diagnostics.errors.push(
				`Durable Objects bindings should specify a "script_name".\n` +
					`Pages requires Durable Object bindings to specify the name of the Worker where the Durable Object is defined.`
			);
		}
	}
}
