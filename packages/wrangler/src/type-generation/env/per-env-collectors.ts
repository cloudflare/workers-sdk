import { experimental_readRawConfig } from "@cloudflare/workers-utils";
import { throwMissingBindingError, TOP_LEVEL_ENV_NAME } from "../helpers";
import { typeofArray } from "./binding-collectors";
import type { typesCommand } from "../index";
import type { RawEnvironment } from "@cloudflare/workers-utils";

export interface PerEnvBinding {
	bindingCategory: string;
	name: string;
	type: string;
}

/**
 * Collects vars per environment, returning a map from environment name to vars.
 *
 * Top-level vars use the sentinel `TOP_LEVEL_ENV_NAME`.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to an object of var names to their type values
 */
export function collectVarsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<string, Record<string, string[]>> {
	const result = new Map<string, Record<string, string[]>>();

	function collectVars(vars: RawEnvironment["vars"]): Record<string, string[]> {
		const varsInfo: Record<string, Set<string>> = {};

		Object.entries(vars ?? {}).forEach(([key, value]) => {
			varsInfo[key] ??= new Set();

			if (!args.strictVars) {
				varsInfo[key].add(
					Array.isArray(value) ? typeofArray(value) : typeof value
				);
				return;
			}

			if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "boolean" ||
				typeof value === "object"
			) {
				varsInfo[key].add(JSON.stringify(value));
				return;
			}

			varsInfo[key].add("unknown");
		});

		return Object.fromEntries(
			Object.entries(varsInfo).map(([key, value]) => [key, [...value]])
		);
	}

	const { rawConfig } = experimental_readRawConfig(args);

	// Collect top-level vars
	const topLevelVars = collectVars(rawConfig.vars);
	if (Object.keys(topLevelVars).length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelVars);
	}

	// Collect per-environment vars
	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envVars = collectVars(env.vars);
		if (Object.keys(envVars).length > 0) {
			result.set(envName, envVars);
		}
	}

	return result;
}

/**
 * Collects core bindings per environment, returning a map from environment name to bindings.
 *
 * Top-level bindings use the sentinel `TOP_LEVEL_ENV_NAME`.
 *
 * Unlike collectCoreBindings which aggregates all bindings, this function keeps them separate
 * per environment for per-environment interface generation.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of bindings
 */
export function collectCoreBindingsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<string, Array<PerEnvBinding>> {
	const result = new Map<string, Array<PerEnvBinding>>();

	function collectEnvironmentBindings(
		env: RawEnvironment | undefined,
		envName: string
	): Array<PerEnvBinding> {
		if (!env) {
			return [];
		}

		const bindings = new Array<PerEnvBinding>();

		for (const [index, kv] of (env.kv_namespaces ?? []).entries()) {
			if (!kv.binding) {
				throwMissingBindingError({
					binding: kv,
					bindingType: "kv_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "kv_namespaces",
				name: kv.binding,
				type: "KVNamespace",
			});
		}

		for (const [index, r2] of (env.r2_buckets ?? []).entries()) {
			if (!r2.binding) {
				throwMissingBindingError({
					binding: r2,
					bindingType: "r2_buckets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "r2_buckets",
				name: r2.binding,
				type: "R2Bucket",
			});
		}

		for (const [index, d1] of (env.d1_databases ?? []).entries()) {
			if (!d1.binding) {
				throwMissingBindingError({
					binding: d1,
					bindingType: "d1_databases",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "d1_databases",
				name: d1.binding,
				type: "D1Database",
			});
		}

		for (const [index, vectorize] of (env.vectorize ?? []).entries()) {
			if (!vectorize.binding) {
				throwMissingBindingError({
					binding: vectorize,
					bindingType: "vectorize",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "vectorize",
				name: vectorize.binding,
				type: "VectorizeIndex",
			});
		}

		for (const [index, hyperdrive] of (env.hyperdrive ?? []).entries()) {
			if (!hyperdrive.binding) {
				throwMissingBindingError({
					binding: hyperdrive,
					bindingType: "hyperdrive",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "hyperdrive",
				name: hyperdrive.binding,
				type: "Hyperdrive",
			});
		}

		for (const [index, sendEmail] of (env.send_email ?? []).entries()) {
			if (!sendEmail.name) {
				throwMissingBindingError({
					binding: sendEmail,
					bindingType: "send_email",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			bindings.push({
				bindingCategory: "send_email",
				name: sendEmail.name,
				type: "SendEmail",
			});
		}

		for (const [index, ae] of (env.analytics_engine_datasets ?? []).entries()) {
			if (!ae.binding) {
				throwMissingBindingError({
					binding: ae,
					bindingType: "analytics_engine_datasets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "analytics_engine_datasets",
				name: ae.binding,
				type: "AnalyticsEngineDataset",
			});
		}

		for (const [index, dispatch] of (env.dispatch_namespaces ?? []).entries()) {
			if (!dispatch.binding) {
				throwMissingBindingError({
					binding: dispatch,
					bindingType: "dispatch_namespaces",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "dispatch_namespaces",
				name: dispatch.binding,
				type: "DispatchNamespace",
			});
		}

		for (const [index, mtls] of (env.mtls_certificates ?? []).entries()) {
			if (!mtls.binding) {
				throwMissingBindingError({
					binding: mtls,
					bindingType: "mtls_certificates",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "mtls_certificates",
				name: mtls.binding,
				type: "Fetcher",
			});
		}

		for (const [index, queue] of (env.queues?.producers ?? []).entries()) {
			if (!queue.binding) {
				throwMissingBindingError({
					binding: queue,
					bindingType: "queues.producers",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "queues_producers",
				name: queue.binding,
				type: "Queue",
			});
		}

		for (const [index, secret] of (env.secrets_store_secrets ?? []).entries()) {
			if (!secret.binding) {
				throwMissingBindingError({
					binding: secret,
					bindingType: "secrets_store_secrets",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "secrets_store_secrets",
				name: secret.binding,
				type: "SecretsStoreSecret",
			});
		}

		for (const [index, helloWorld] of (
			env.unsafe_hello_world ?? []
		).entries()) {
			if (!helloWorld.binding) {
				throwMissingBindingError({
					binding: helloWorld,
					bindingType: "unsafe_hello_world",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "unsafe_hello_world",
				name: helloWorld.binding,
				type: "HelloWorldBinding",
			});
		}

		for (const [index, ratelimit] of (env.ratelimits ?? []).entries()) {
			if (!ratelimit.name) {
				throwMissingBindingError({
					binding: ratelimit,
					bindingType: "ratelimits",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			bindings.push({
				bindingCategory: "ratelimits",
				name: ratelimit.name,
				type: "RateLimit",
			});
		}

		for (const [index, workerLoader] of (env.worker_loaders ?? []).entries()) {
			if (!workerLoader.binding) {
				throwMissingBindingError({
					binding: workerLoader,
					bindingType: "worker_loaders",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "worker_loaders",
				name: workerLoader.binding,
				type: "WorkerLoader",
			});
		}

		for (const [index, vpcService] of (env.vpc_services ?? []).entries()) {
			if (!vpcService.binding) {
				throwMissingBindingError({
					binding: vpcService,
					bindingType: "vpc_services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			bindings.push({
				bindingCategory: "vpc_services",
				name: vpcService.binding,
				type: "Fetcher",
			});
		}

		// Pipelines handled separately for async schema fetching

		if (env.logfwdr?.bindings?.length) {
			bindings.push({
				bindingCategory: "logfwdr",
				name: "LOGFWDR_SCHEMA",
				type: "any",
			});
		}

		if (env.browser) {
			if (!env.browser.binding) {
				throwMissingBindingError({
					binding: env.browser,
					bindingType: "browser",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "browser",
					name: env.browser.binding,
					type: "Fetcher",
				});
			}
		}

		if (env.ai) {
			if (!env.ai.binding) {
				throwMissingBindingError({
					binding: env.ai,
					bindingType: "ai",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "ai",
					name: env.ai.binding,
					type: "Ai",
				});
			}
		}

		if (env.images) {
			if (!env.images.binding) {
				throwMissingBindingError({
					binding: env.images,
					bindingType: "images",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "images",
					name: env.images.binding,
					type: "ImagesBinding",
				});
			}
		}

		if (env.media) {
			if (!env.media.binding) {
				throwMissingBindingError({
					binding: env.media,
					bindingType: "media",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "media",
					name: env.media.binding,
					type: "MediaBinding",
				});
			}
		}

		if (env.version_metadata) {
			if (!env.version_metadata.binding) {
				throwMissingBindingError({
					binding: env.version_metadata,
					bindingType: "version_metadata",
					configPath: args.config,
					envName,
					fieldName: "binding",
				});
			} else {
				bindings.push({
					bindingCategory: "version_metadata",
					name: env.version_metadata.binding,
					type: "WorkerVersionMetadata",
				});
			}
		}

		if (env.assets?.binding) {
			bindings.push({
				bindingCategory: "assets",
				name: env.assets.binding,
				type: "Fetcher",
			});
		}

		return bindings;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelBindings = collectEnvironmentBindings(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelBindings.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelBindings);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envBindings = collectEnvironmentBindings(env, envName);
		if (envBindings.length > 0) {
			result.set(envName, envBindings);
		}
	}

	return result;
}

/**
 * Collects Durable Object bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of DO bindings
 */
export function collectDurableObjectsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		class_name: string;
		name: string;
		script_name?: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			class_name: string;
			name: string;
			script_name?: string;
		}>
	>();

	function collectEnvironmentDOs(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{ name: string; class_name: string; script_name?: string }> {
		const durableObjects = new Array<{
			name: string;
			class_name: string;
			script_name?: string;
		}>();

		if (!env?.durable_objects?.bindings) {
			return durableObjects;
		}

		for (const [index, doBinding] of env.durable_objects.bindings.entries()) {
			if (!doBinding.name) {
				throwMissingBindingError({
					binding: doBinding,
					bindingType: "durable_objects.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			durableObjects.push({
				class_name: doBinding.class_name,
				name: doBinding.name,
				script_name: doBinding.script_name,
			});
		}

		return durableObjects;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelDOs = collectEnvironmentDOs(rawConfig, TOP_LEVEL_ENV_NAME);
	if (topLevelDOs.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelDOs);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envDOs = collectEnvironmentDOs(env, envName);
		if (envDOs.length > 0) {
			result.set(envName, envDOs);
		}
	}

	return result;
}

/**
 * Collects Service bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of service bindings
 */
export function collectServicesPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		entrypoint?: string;
		service: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			entrypoint?: string;
			service: string;
		}>
	>();

	function collectEnvironmentServices(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		entrypoint?: string;
		service: string;
	}> {
		const services = new Array<{
			binding: string;
			service: string;
			entrypoint?: string;
		}>();

		if (!env?.services) {
			return services;
		}

		for (const [index, service] of env.services.entries()) {
			if (!service.binding) {
				throwMissingBindingError({
					binding: service,
					bindingType: "services",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			services.push({
				binding: service.binding,
				entrypoint: service.entrypoint,
				service: service.service,
			});
		}

		return services;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelServices = collectEnvironmentServices(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelServices.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelServices);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envServices = collectEnvironmentServices(env, envName);
		if (envServices.length > 0) {
			result.set(envName, envServices);
		}
	}

	return result;
}

/**
 * Collects Workflow bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of workflow bindings
 */
export function collectWorkflowsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		class_name: string;
		name: string;
		script_name?: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			class_name: string;
			name: string;
			script_name?: string;
		}>
	>();

	function collectEnvironmentWorkflows(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		class_name: string;
		name: string;
		script_name?: string;
	}> {
		const workflows = new Array<{
			binding: string;
			class_name: string;
			name: string;
			script_name?: string;
		}>();

		if (!env?.workflows) {
			return workflows;
		}

		for (const [index, workflow] of env.workflows.entries()) {
			if (!workflow.binding) {
				throwMissingBindingError({
					binding: workflow,
					bindingType: "workflows",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			workflows.push({
				binding: workflow.binding,
				class_name: workflow.class_name,
				name: workflow.name,
				script_name: workflow.script_name,
			});
		}

		return workflows;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelWorkflows = collectEnvironmentWorkflows(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelWorkflows.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelWorkflows);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envWorkflows = collectEnvironmentWorkflows(env, envName);
		if (envWorkflows.length > 0) {
			result.set(envName, envWorkflows);
		}
	}

	return result;
}

/**
 * Collects unsafe bindings per environment.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of unsafe bindings
 */
export function collectUnsafeBindingsPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		name: string;
		type: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			name: string;
			type: string;
		}>
	>();

	function collectEnvironmentUnsafe(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		name: string;
		type: string;
	}> {
		const unsafeBindings = new Array<{
			name: string;
			type: string;
		}>();

		if (!env?.unsafe?.bindings) {
			return unsafeBindings;
		}

		for (const [index, binding] of env.unsafe.bindings.entries()) {
			if (!binding.name) {
				throwMissingBindingError({
					binding,
					bindingType: "unsafe.bindings",
					configPath: args.config,
					envName,
					fieldName: "name",
					index,
				});
			}

			unsafeBindings.push({
				name: binding.name,
				type: binding.type,
			});
		}

		return unsafeBindings;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelUnsafe = collectEnvironmentUnsafe(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelUnsafe.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelUnsafe);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envUnsafe = collectEnvironmentUnsafe(env, envName);
		if (envUnsafe.length > 0) {
			result.set(envName, envUnsafe);
		}
	}

	return result;
}

/**
 * Collects pipeline bindings per environment.
 *
 * This is separate from collectCoreBindingsPerEnvironment because pipelines
 * need async schema fetching for typed bindings.
 *
 * @param args - CLI arguments passed to the `types` command
 *
 * @returns A map of environment name to array of pipeline bindings
 */
export function collectPipelinesPerEnvironment(
	args: Partial<(typeof typesCommand)["args"]>
): Map<
	string,
	Array<{
		binding: string;
		pipeline: string;
	}>
> {
	const result = new Map<
		string,
		Array<{
			binding: string;
			pipeline: string;
		}>
	>();

	function collectEnvironmentPipelines(
		env: RawEnvironment | undefined,
		envName: string
	): Array<{
		binding: string;
		pipeline: string;
	}> {
		const pipelines = new Array<{
			binding: string;
			pipeline: string;
		}>();

		if (!env?.pipelines) {
			return pipelines;
		}

		for (const [index, pipeline] of env.pipelines.entries()) {
			if (!pipeline.binding) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "binding",
					index,
				});
			}

			if (!pipeline.pipeline) {
				throwMissingBindingError({
					binding: pipeline,
					bindingType: "pipelines",
					configPath: args.config,
					envName,
					fieldName: "pipeline",
					index,
				});
			}

			pipelines.push({
				binding: pipeline.binding,
				pipeline: pipeline.pipeline,
			});
		}

		return pipelines;
	}

	const { rawConfig } = experimental_readRawConfig(args);

	const topLevelPipelines = collectEnvironmentPipelines(
		rawConfig,
		TOP_LEVEL_ENV_NAME
	);
	if (topLevelPipelines.length > 0) {
		result.set(TOP_LEVEL_ENV_NAME, topLevelPipelines);
	}

	for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
		const envPipelines = collectEnvironmentPipelines(env, envName);
		if (envPipelines.length > 0) {
			result.set(envName, envPipelines);
		}
	}

	return result;
}
