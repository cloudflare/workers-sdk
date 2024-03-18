/**
 * Pages now supports configuration via `wrangler.toml`. As opposed to
 * Workers however, Pages only supports a limited subset of all available
 * configuration keys.
 *
 * This file contains all `wrangler.toml` validation things, specific to
 * Pages.
 */

import { FatalError } from "../errors";
import { defaultWranglerConfig } from "./config";
import { Diagnostics } from "./diagnostics";
import type { Config } from "./config";

const supportedPagesConfigFields = [
	"pages_build_output_dir",
	"name",
	"compatibility_date",
	"compatibility_flags",
	"send_metrics",
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
	"dev",
] as const;

export function validatePagesConfig(
	config: Config,
	envNames: string[]
): Diagnostics {
	// exhaustive check
	if (!config.pages_build_output_dir) {
		throw new FatalError(`Attempting to validate Pages configuration file, but no "pages_build_output_dir" configuration key was found.
		"pages_build_output_dir" is required for Pages projects.`);
	}

	const diagnostics = new Diagnostics(
		`Running configuration file validation for Pages:`
	);

	validateMainField(config, diagnostics);
	validatePagesEnvironmentNames(envNames, diagnostics);
	validateUnsupportedFields(config, diagnostics);

	return diagnostics;
}

/**
 * Validate that configuration file doesn't declare "main", if
 * "pages_build_output_dir" is present
 */
function validateMainField(config: Config, diagnostics: Diagnostics) {
	if (config.main !== undefined) {
		diagnostics.errors.push(
			`Configuration file cannot contain both both "main" and "pages_build_output_dir" configuration keys.
			Please use "main" if you are deploying a Worker, or "pages_build_output_dir" if you are deploying a Pages project.`
		);
	}
}

/**
 * Validate that no named-environments other than "preview" and "production"
 * were declared in the configuration file for Pages
 */
function validatePagesEnvironmentNames(
	envNames: string[],
	diagnostics: Diagnostics
) {
	if (!envNames?.length) return;

	const unsupportedPagesEnvNames = envNames.filter(
		(name) => name !== "preview" && name !== "production"
	);

	if (unsupportedPagesEnvNames.length > 0) {
		diagnostics.errors.push(
			`Configuration file contains environment names that are not supported by Pages projects:
			${unsupportedPagesEnvNames.join()}.
			The supported named-environments for Pages are "preview" and "production".`
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
