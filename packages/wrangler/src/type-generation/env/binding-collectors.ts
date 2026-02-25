import {
	experimental_readRawConfig,
	UserError,
} from "@cloudflare/workers-utils";
import { throwMissingBindingError, TOP_LEVEL_ENV_NAME } from "../helpers";
import type { typesCommand } from "../index";
import type { RawEnvironment } from "@cloudflare/workers-utils";

export interface CollectedBinding {
	/**
	 * The binding category (e.g., "kv_namespaces", "d1_databases")
	 */
	bindingCategory: string;

	/**
	 * The binding name (e.g., "MY_KV_NAMESPACE")
	 */
	name: string;

	/**
	 * The TypeScript type (e.g., "KVNamespace")
	 */
	type: string;
}

/**
 * Retrieves the environment config for a specific environment name, throwing if it doesn't exist.
 *
 * @param environmentName - The environment name specified via --env
 * @param rawConfig - The raw config object
 *
 * @returns The environment config object
 *
 * @throws {UserError} If the environment doesn't exist in the config
 */
function getEnvConfig(
	environmentName: string,
	rawConfig: { env?: Record<string, RawEnvironment> }
): RawEnvironment {
	const envConfig = rawConfig.env?.[environmentName];
	if (!envConfig) {
		const availableEnvs = Object.keys(rawConfig.env ?? {});
		const envList =
			availableEnvs.length > 0
				? `Available environments: ${availableEnvs.join(", ")}`
				: "No environments are defined in the configuration file.";
		throw new UserError(
			`Environment "${environmentName}" not found in configuration.\n${envList}`
		);
	}

	return envConfig;
}

/**
 * Given an array it returns a string representing the types present in such array
 *
 * @param array the target array
 *
 * @returns a string representing the types of such array
 *
 * @example
 * `[1, 2, 3]` => `number[]`
 * `[1, 2, 'three']` => `(number|string)[]`
 * `['false', true]` => `(string|boolean)[]`
 */
export function typeofArray(array: unknown[]): string {
	const typesInArray = [...new Set(array.map((item) => typeof item))].sort();

	if (typesInArray.length === 1) {
		return `${typesInArray[0]}[]`;
	}

	return `(${typesInArray.join("|")})[]`;
}

/**
 * Collects all the vars types across all the environments defined in the config file
 *
 * Behavior:
 * - If `args.env` is specified: only collect vars from that specific environment
 * - Otherwise: collect vars from top-level AND all named environments
 *
 * @param args all the CLI arguments passed to the `types` command
 *
 * @returns an object which keys are the variable names and values are arrays containing all the computed types for such variables
 */
export function collectAllVars(
	args: Partial<(typeof typesCommand)["args"]>
): Record<string, string[]> {
	const varsInfo: Record<string, Set<string>> = {};

	// Collects onto the `varsInfo` object the vars and values for a specific environment
	function collectEnvironmentVars(vars: RawEnvironment["vars"]) {
		Object.entries(vars ?? {}).forEach(([key, value]) => {
			varsInfo[key] ??= new Set();

			if (!args.strictVars) {
				// when strict-vars is false we basically only want the plain "typeof" values
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

			// let's fallback to a safe `unknown` if we couldn't detect the type
			varsInfo[key].add("unknown");
		});
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentVars(envConfig.vars);
	} else {
		collectEnvironmentVars(rawConfig.vars);
		for (const env of Object.values(rawConfig.env ?? {})) {
			collectEnvironmentVars(env.vars);
		}
	}

	return Object.fromEntries(
		Object.entries(varsInfo).map(([key, value]) => [key, [...value]])
	);
}

/**
 * Collects all core bindings across environments defined in the config file
 *
 * This will aggregate and collect all bindings that can be collected in the same way.
 * However some other resources, such as Durable Objects, services, etc, all have to be
 * handled uniquely and as such have their own dedicated `collectX` functions.
 *
 * Behavior:
 * - If `args.env` is specified: only collect bindings from that specific environment
 * - Otherwise: collect bindings from top-level AND all named environments
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected bindings with their names, types, and categories
 *
 * @throws {UserError} If a binding name exists with different types across environments
 */
export function collectCoreBindings(
	args: Partial<(typeof typesCommand)["args"]>
): Array<CollectedBinding> {
	const bindingsMap = new Map<string, CollectedBinding>();

	function addBinding(
		name: string,
		type: string,
		bindingCategory: string,
		envName: string
	) {
		const existing = bindingsMap.get(name);
		if (existing) {
			if (existing.bindingCategory !== bindingCategory) {
				throw new UserError(
					`Binding "${name}" has conflicting types across environments: ` +
						`"${existing.bindingCategory}" vs "${bindingCategory}" (in ${envName}). ` +
						`Please use unique binding names for different binding types.`
				);
			}

			return;
		}
		bindingsMap.set(name, { name, type, bindingCategory });
	}

	function collectEnvironmentBindings(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env) {
			return;
		}

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

			addBinding(kv.binding, "KVNamespace", "kv_namespaces", envName);
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

			addBinding(r2.binding, "R2Bucket", "r2_buckets", envName);
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

			addBinding(d1.binding, "D1Database", "d1_databases", envName);
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

			addBinding(vectorize.binding, "VectorizeIndex", "vectorize", envName);
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

			addBinding(hyperdrive.binding, "Hyperdrive", "hyperdrive", envName);
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

			addBinding(sendEmail.name, "SendEmail", "send_email", envName);
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

			addBinding(
				ae.binding,
				"AnalyticsEngineDataset",
				"analytics_engine_datasets",
				envName
			);
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

			addBinding(
				dispatch.binding,
				"DispatchNamespace",
				"dispatch_namespaces",
				envName
			);
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

			addBinding(mtls.binding, "Fetcher", "mtls_certificates", envName);
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

			addBinding(queue.binding, "Queue", "queues_producers", envName);
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

			addBinding(
				secret.binding,
				"SecretsStoreSecret",
				"secrets_store_secrets",
				envName
			);
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

			addBinding(
				helloWorld.binding,
				"HelloWorldBinding",
				"unsafe_hello_world",
				envName
			);
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

			addBinding(ratelimit.name, "RateLimit", "ratelimits", envName);
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

			addBinding(
				workerLoader.binding,
				"WorkerLoader",
				"worker_loaders",
				envName
			);
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

			addBinding(vpcService.binding, "Fetcher", "vpc_services", envName);
		}

		// Pipelines handled separately for async schema fetching

		if (env.logfwdr?.bindings?.length) {
			addBinding("LOGFWDR_SCHEMA", "any", "logfwdr", envName);
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
				addBinding(env.browser.binding, "Fetcher", "browser", envName);
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
				addBinding(env.ai.binding, "Ai", "ai", envName);
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
				addBinding(env.images.binding, "ImagesBinding", "images", envName);
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
				addBinding(env.media.binding, "MediaBinding", "media", envName);
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
				addBinding(
					env.version_metadata.binding,
					"WorkerVersionMetadata",
					"version_metadata",
					envName
				);
			}
		}

		if (env.assets?.binding) {
			addBinding(env.assets.binding, "Fetcher", "assets", envName);
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentBindings(envConfig, args.env);
	} else {
		collectEnvironmentBindings(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentBindings(env, envName);
		}
	}

	return Array.from(bindingsMap.values());
}

/**
 * Collects Durable Object bindings across environments.
 *
 * This is separate because DOs need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected Durable Object bindings with their names, class name & possible script name.
 */
export function collectAllDurableObjects(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	class_name: string;
	name: string;
	script_name?: string;
}> {
	const durableObjectsMap = new Map<
		string,
		{
			class_name: string;
			name: string;
			script_name?: string;
		}
	>();

	function collectEnvironmentDOs(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.durable_objects?.bindings) {
			return;
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

			if (durableObjectsMap.has(doBinding.name)) {
				continue;
			}

			durableObjectsMap.set(doBinding.name, {
				class_name: doBinding.class_name,
				name: doBinding.name,
				script_name: doBinding.script_name,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentDOs(envConfig, args.env);
	} else {
		collectEnvironmentDOs(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentDOs(env, envName);
		}
	}

	return Array.from(durableObjectsMap.values());
}

/**
 * Collects Service bindings across environments.
 *
 * This is separate because services need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected service bindings with their binding, service & possible entrypoint.
 */
export function collectAllServices(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	service: string;
	entrypoint?: string;
}> {
	const servicesMap = new Map<
		string,
		{
			binding: string;
			entrypoint?: string;
			service: string;
		}
	>();

	function collectEnvironmentServices(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.services) {
			return;
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

			if (servicesMap.has(service.binding)) {
				continue;
			}

			servicesMap.set(service.binding, {
				binding: service.binding,
				entrypoint: service.entrypoint,
				service: service.service,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentServices(envConfig, args.env);
	} else {
		collectEnvironmentServices(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentServices(env, envName);
		}
	}

	return Array.from(servicesMap.values());
}

/**
 * Collects Workflow bindings across environments.
 *
 * This is separate because workflows need special handling for type generation.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected workflow bindings with their names, class name, binding and possible script name.
 */
export function collectAllWorkflows(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	name: string;
	class_name: string;
	script_name?: string;
}> {
	const workflowsMap = new Map<
		string,
		{
			binding: string;
			name: string;
			class_name: string;
			script_name?: string;
		}
	>();

	function collectEnvironmentWorkflows(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.workflows) {
			return;
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

			if (workflowsMap.has(workflow.binding)) {
				continue;
			}

			workflowsMap.set(workflow.binding, {
				binding: workflow.binding,
				name: workflow.name,
				class_name: workflow.class_name,
				script_name: workflow.script_name,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentWorkflows(envConfig, args.env);
	} else {
		collectEnvironmentWorkflows(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentWorkflows(env, envName);
		}
	}

	return Array.from(workflowsMap.values());
}

/**
 * Collects unsafe bindings across environments.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected unsafe bindings with their names and type.
 */
export function collectAllUnsafeBindings(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	name: string;
	type: string;
}> {
	const unsafeMap = new Map<
		string,
		{
			name: string;
			type: string;
		}
	>();

	function collectEnvironmentUnsafe(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.unsafe?.bindings) {
			return;
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

			if (unsafeMap.has(binding.name)) {
				continue;
			}

			unsafeMap.set(binding.name, {
				name: binding.name,
				type: binding.type,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentUnsafe(envConfig, args.env);
	} else {
		collectEnvironmentUnsafe(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentUnsafe(env, envName);
		}
	}

	return Array.from(unsafeMap.values());
}

/**
 * Collects pipeline bindings across environments.
 *
 * This is separate from collectCoreBindings because pipelines need async
 * schema fetching for typed bindings.
 *
 * @param args - All the CLI arguments passed to the `types` command
 *
 * @returns An array of collected pipeline bindings with their names and pipeline IDs.
 */
export function collectAllPipelines(
	args: Partial<(typeof typesCommand)["args"]>
): Array<{
	binding: string;
	pipeline: string;
}> {
	const pipelinesMap = new Map<
		string,
		{
			binding: string;
			pipeline: string;
		}
	>();

	function collectEnvironmentPipelines(
		env: RawEnvironment | undefined,
		envName: string
	) {
		if (!env?.pipelines) {
			return;
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

			if (pipelinesMap.has(pipeline.binding)) {
				continue;
			}

			pipelinesMap.set(pipeline.binding, {
				binding: pipeline.binding,
				pipeline: pipeline.pipeline,
			});
		}
	}

	const { rawConfig } = experimental_readRawConfig(args);

	if (args.env) {
		const envConfig = getEnvConfig(args.env, rawConfig);
		collectEnvironmentPipelines(envConfig, args.env);
	} else {
		collectEnvironmentPipelines(rawConfig, TOP_LEVEL_ENV_NAME);
		for (const [envName, env] of Object.entries(rawConfig.env ?? {})) {
			collectEnvironmentPipelines(env, envName);
		}
	}

	return Array.from(pipelinesMap.values());
}
