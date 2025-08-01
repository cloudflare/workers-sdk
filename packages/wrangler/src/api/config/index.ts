// TODO: the types need to be moved here
import type { RawEnvironment } from "../../config";

const environmentInheritableKeys = new Set([
	"name",
	"account_id",
	"compatibility_date",
	"compatibility_flags",
	"main",
	"find_additional_modules",
	"preserve_file_names",
	"base_dir",
	"workers_dev",
	"preview_urls",
	"routes",
	"route",
	"tsconfig",
	"jsx_factory",
	"jsx_fragment",
	"migrations",
	"triggers",
	"usage_model",
	"limits",
	"rules",
	"build",
	"no_bundle",
	"minify",
	"node_compat",
	"first_party_worker",
	"zone_id",
	"logfwdr",
	"logpush",
	"upload_source_maps",
	"placement",
	"assets",
	"observability",
	"tail_consumers",
]);

const environmentNonInheritableKeys = new Set([
	"vars",
	"define",
	"durable_objects",
	"kv_namespaces",
	"r2_buckets",
	"d1_databases",
	"analytics_engine_datasets",
	"unsafe_hello_world",
	"unsafe",
	"legacy_env",
	"dev",
	"send_metrics",
	"keep_vars",
	"data_blobs",
	"text_blobs",
	"wasm_modules",
	"alias",
	"site",
	"pipelines",
	"hyperdrive",
	"secrets_store_secrets",
	"services",
	"cloudchamber",
	"containers",
	"vectorize",
	"ai",
	"images",
	"version_metadata",
	"queues",
	"browser",
	"dispatch_namespaces",
	"send_email",
	"mtls_certificates",
]);

export type ResolutionError = {
	message: string;
	severity: "warning" | "error" | "critical";
};

/**
 * Resolves a raw wrangler configuration into an environment configuration.
 *
 * This function replicates in a simplified manner what wrangler does for resolving
 * the configuration resolution where inherited and non-inherited fields need to be
 * properly handled to form the final environment configuration to use.
 *
 * For more details on these fields see the Environment interface in ./types/environment.ts
 */
export function resolveEnvConfig(
	rawConfig: Record<string, unknown>,
	environment: string | null
): {
	envConfig: RawEnvironment | null;
	errors: ResolutionError[];
} {
	const errors: ResolutionError[] = [];
	if (!environment) {
		// no environment was specified so we can simply return the full configuration without the potential env field
		const { $schema: _$schema, env: _env, ...config } = rawConfig;
		let topLevelConfig = JSON.parse(JSON.stringify(config)) as RawEnvironment;
		topLevelConfig = Object.fromEntries(
			Object.entries(topLevelConfig).filter(([key]) => {
				if (
					!environmentInheritableKeys.has(key) &&
					!environmentNonInheritableKeys.has(key)
				) {
					errors.push({
						message: `Unexpected fields found in top-level field: "${key}"`,
						severity: "warning",
					});
					return false;
				}
				return true;
			})
		);

		if (topLevelConfig.route && topLevelConfig.routes?.length) {
			errors.push({
				severity: "error",
				message:
					'Expected exactly one of the following fields ["routes","route"].',
			});
		}

		return {
			envConfig: topLevelConfig,
			errors,
		};
	}

	const environments = Object.keys(rawConfig.env ?? {});
	if (environments.length === 0) {
		return {
			envConfig: null,
			errors: [
				{
					message: `Requested the "${environment}" environment, but none were found in the configuration file`,
					severity: "critical",
				},
			],
		};
	}

	if (!environments.includes(environment)) {
		return {
			envConfig: null,
			errors: [
				{
					message: `Could not find the specified Cloudflare environment "${environment}", the environments defined in the configuration file are: ${environments.map((env) => JSON.stringify(env)).join(", ")}`,
					severity: "critical",
				},
			],
		};
	}

	const config: Record<string, unknown> = {};

	for (const key of Object.keys(rawConfig)) {
		if (environmentInheritableKeys.has(key)) {
			config[key] = rawConfig[key as keyof typeof rawConfig];
		}
	}

	let envSpecificNameUsed = false;
	const rawConfigEnv = rawConfig["env"] as Record<string, unknown> | undefined;
	if (rawConfigEnv?.[environment]) {
		const rawEnvironmentConfig = rawConfigEnv[environment] as
			| Record<string, unknown>
			| undefined;
		if (rawEnvironmentConfig) {
			for (const key of Object.keys(rawEnvironmentConfig)) {
				if (rawConfig.legacy_env === false) {
					if (["name", "account_id"].includes(key)) {
						errors.push({
							severity: "error",
							message: `The "${key}" field is not allowed in named service environments.\nPlease remove the field from this environment.`,
						});
						continue;
					}
				}

				if (key === "name") {
					envSpecificNameUsed = true;
				}

				config[key] =
					rawEnvironmentConfig[key as keyof typeof rawEnvironmentConfig];
			}

			const envRawConfig = rawConfigEnv[environment] as Record<string, unknown>;

			environmentNonInheritableKeys.forEach((nonInheritableKey) => {
				if (
					rawConfig[nonInheritableKey] &&
					!(nonInheritableKey in envRawConfig)
				) {
					errors.push({
						severity: "warning",
						message: `"${nonInheritableKey}" exists at the top level, but not on "env.${environment}".\nThis is not what you probably want, since "${nonInheritableKey}" is not inherited by environments.\nPlease add "${nonInheritableKey}" to "env.${environment}".`,
					});
					return;
				}

				if (
					typeof rawConfig[nonInheritableKey] === "object" &&
					rawConfig[nonInheritableKey] !== null &&
					typeof envRawConfig[nonInheritableKey] === "object" &&
					envRawConfig[nonInheritableKey] !== null
				) {
					const topLevelObj = rawConfig[nonInheritableKey] as Record<
						string,
						unknown
					>;
					const envObj = envRawConfig[nonInheritableKey] as Record<
						string,
						unknown
					>;
					Object.keys(rawConfig[nonInheritableKey]).forEach((key) => {
						if (!(key in envObj)) {
							errors.push({
								severity: "warning",
								message: `"${nonInheritableKey}.${key}" exists at the top level, but not on "env.${environment}.${nonInheritableKey}".\nThis is not what you probably want, since "${nonInheritableKey}" configuration is not inherited by environments.\nPlease add "${nonInheritableKey}.${key}" to "env.${environment}".`,
							});
						}
					});
					Object.keys(envObj).forEach((key) => {
						if (!(key in topLevelObj)) {
							errors.push({
								severity: "warning",
								message: `"${key}" exists on "env.${environment}", but not on the top level.\nThis is not what you probably want, since "${nonInheritableKey}" configuration within environments can only override existing top level "${nonInheritableKey}" configuration\nPlease remove "env.${environment}.${nonInheritableKey}.${key}", or add "${nonInheritableKey}.${key}".`,
							});
						}
					});
					return;
				}
			});

			if (
				rawEnvironmentConfig.route &&
				(rawEnvironmentConfig.routes as undefined | unknown[])?.length
			) {
				errors.push({
					severity: "error",
					message:
						'Expected exactly one of the following fields ["routes","route"].',
				});
			}
		}
	}

	if (rawConfig.legacy_env !== false && !envSpecificNameUsed) {
		config.name = `${config.name}-${environment}`;
	}

	return {
		envConfig: config as unknown as RawEnvironment,
		errors,
	};
}

export type TypeofType = ReturnType<typeof _typeof>;
const _typeof = (_: unknown) => typeof _;
