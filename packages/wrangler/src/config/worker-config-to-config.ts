/**
 * Converts a WorkerConfig (programmatic config) to a Config (TOML-style config).
 *
 * This enables the deploy flow (and other commands that consume Config) to work
 * with programmatic config without rewriting their internals.
 *
 * The conversion is: WorkerConfig → Config at the command boundary.
 * TOML users still go through readConfig() as before.
 */
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import type { Binding, Config, Trigger } from "@cloudflare/workers-utils";
import type { WorkerConfig } from "@cloudflare/workers-utils/programmatic";

/**
 * The input to workerConfigToConfig(). Uses WorkerConfig (the user-facing type)
 * plus optional fields that WorkerConfig omits (migrations, bindings).
 */
type WorkerConfigInput = WorkerConfig & {
	/** DO migrations, omitted from WorkerConfig but needed for deploy. */
	migrations?: Config["migrations"];
};

export interface WorkerConfigToConfigOptions {
	/** Path to the programmatic config file (cf.config.ts). Used for configPath/userConfigPath. */
	configPath?: string;
}

/**
 * Convert a WorkerConfig (programmatic/SDW format) to Config (TOML format).
 *
 * This is the reverse of what ConfigController does (Config → SDW).
 * It enables commands that consume Config to accept programmatic config.
 */
export function workerConfigToConfig(
	wc: WorkerConfigInput,
	options: WorkerConfigToConfigOptions = {}
): Config {
	const bindings = unflattenBindings(wc.env ?? {});
	const triggers = splitTriggers(wc.triggers ?? []);

	return {
		// -- Computed fields --
		configPath: options.configPath,
		userConfigPath: options.configPath,
		topLevelName: wc.name,
		definedEnvironments: undefined,
		targetEnvironment: undefined,
		flatBindings: wc.env,

		// -- ConfigFields --
		legacy_env: true,
		send_metrics: wc.sendMetrics,
		dev: defaultWranglerConfig.dev,
		site: undefined,
		wasm_modules: bindings.wasm_modules,
		text_blobs: bindings.text_blobs,
		data_blobs: bindings.data_blobs,
		alias: wc.build?.alias ?? undefined,
		keep_vars: wc.deploy?.keepVars,

		// -- PagesConfigFields --
		pages_build_output_dir: undefined,

		// -- EnvironmentInheritable --
		name: wc.name,
		account_id: undefined,
		main: wc.entrypoint,
		compatibility_date: wc.compatibilityDate,
		compatibility_flags: wc.compatibilityFlags ?? [],
		limits: wc.deploy?.limits,
		placement: wc.deploy?.placement,

		find_additional_modules: wc.build?.findAdditionalModules,
		preserve_file_names: wc.build?.preserveFileNames,
		base_dir: wc.build?.moduleRoot,
		workers_dev: wc.deploy?.workersDev ?? triggers.workers_dev,
		preview_urls: wc.deploy?.previewUrls,
		route: undefined,
		routes: triggers.routes.length > 0 ? triggers.routes : undefined,
		tsconfig: wc.build?.tsconfig,
		jsx_factory: wc.build?.jsxFactory ?? "React.createElement",
		jsx_fragment: wc.build?.jsxFragment ?? "React.Fragment",
		migrations: wc.migrations ?? [],
		triggers: {
			crons: triggers.crons.length > 0 ? triggers.crons : undefined,
		},
		rules: wc.build?.moduleRules ?? [],
		build: {
			command: wc.build?.custom?.command,
			watch_dir: wc.build?.custom?.watch
				? Array.isArray(wc.build.custom.watch)
					? wc.build.custom.watch[0]
					: wc.build.custom.watch
				: "./src",
			cwd: wc.build?.custom?.workingDirectory,
		},
		no_bundle: wc.build?.bundle === false ? true : undefined,
		minify: wc.build?.minify,
		keep_names: wc.build?.keepNames,
		define: wc.build?.define ?? {},
		first_party_worker: wc.deploy?.firstPartyWorker,
		logpush: wc.deploy?.logpush,
		upload_source_maps: wc.deploy?.uploadSourceMaps,
		observability: wc.deploy?.observability ?? { enabled: true },
		compliance_region: wc.complianceRegion,
		python_modules: {
			exclude: wc.pythonModules?.exclude ?? ["**/*.pyc"],
		},

		// -- EnvironmentNonInheritable (bindings) --
		vars: bindings.vars,
		durable_objects: bindings.durable_objects,
		kv_namespaces: bindings.kv_namespaces,
		queues: {
			producers: bindings.queue_producers,
			consumers: triggers.queue_consumers,
		},
		r2_buckets: bindings.r2_buckets,
		d1_databases: bindings.d1_databases,
		vectorize: bindings.vectorize,
		hyperdrive: bindings.hyperdrive,
		workflows: bindings.workflows,
		secrets_store_secrets: bindings.secrets_store_secrets,
		services: bindings.services,
		analytics_engine_datasets: bindings.analytics_engine_datasets,
		ai: bindings.ai,
		images: bindings.images,
		media: bindings.media,
		version_metadata: bindings.version_metadata,
		unsafe_hello_world: bindings.unsafe_hello_world,
		ratelimits: bindings.ratelimits,
		worker_loaders: bindings.worker_loaders,

		// -- Other non-inheritable --
		cloudchamber: {},
		containers: wc.containers,
		send_email: bindings.send_email,
		browser: bindings.browser,
		unsafe: wc.unsafe ?? {},
		dispatch_namespaces: bindings.dispatch_namespaces,
		mtls_certificates: bindings.mtls_certificates,
		logfwdr: { bindings: bindings.logfwdr },
		tail_consumers: wc.tailConsumers,
		streaming_tail_consumers: wc.streamingTailConsumers,
		pipelines: bindings.pipelines,
		vpc_services: bindings.vpc_services,
		assets: wc.assets ? { directory: wc.assets } : undefined,
	};
}

// ============================================================================
// Binding unflattening
// ============================================================================

interface UnflattenedBindings {
	vars: Config["vars"];
	kv_namespaces: Config["kv_namespaces"];
	durable_objects: Config["durable_objects"];
	r2_buckets: Config["r2_buckets"];
	d1_databases: Config["d1_databases"];
	services: Config["services"];
	queue_producers: NonNullable<Config["queues"]["producers"]>;
	analytics_engine_datasets: Config["analytics_engine_datasets"];
	ai: Config["ai"];
	images: Config["images"];
	media: Config["media"];
	version_metadata: Config["version_metadata"];
	browser: Config["browser"];
	send_email: Config["send_email"];
	dispatch_namespaces: Config["dispatch_namespaces"];
	mtls_certificates: Config["mtls_certificates"];
	hyperdrive: Config["hyperdrive"];
	vectorize: Config["vectorize"];
	logfwdr: NonNullable<Config["logfwdr"]["bindings"]>;
	pipelines: Config["pipelines"];
	secrets_store_secrets: Config["secrets_store_secrets"];
	unsafe_hello_world: Config["unsafe_hello_world"];
	ratelimits: Config["ratelimits"];
	worker_loaders: Config["worker_loaders"];
	vpc_services: Config["vpc_services"];
	workflows: Config["workflows"];
	wasm_modules: Config["wasm_modules"];
	text_blobs: Config["text_blobs"];
	data_blobs: Config["data_blobs"];
}

/**
 * Convert flat Record<string, Binding> back to Config's typed binding arrays.
 * This is the reverse of convertConfigToBindings().
 */
function unflattenBindings(
	bindings: Record<string, Binding>
): UnflattenedBindings {
	const result: UnflattenedBindings = {
		vars: {},
		kv_namespaces: [],
		durable_objects: { bindings: [] },
		r2_buckets: [],
		d1_databases: [],
		services: [],
		queue_producers: [],
		analytics_engine_datasets: [],
		ai: undefined,
		images: undefined,
		media: undefined,
		version_metadata: undefined,
		browser: undefined,
		send_email: [],
		dispatch_namespaces: [],
		mtls_certificates: [],
		hyperdrive: [],
		vectorize: [],
		logfwdr: [],
		pipelines: [],
		secrets_store_secrets: [],
		unsafe_hello_world: [],
		ratelimits: [],
		worker_loaders: [],
		vpc_services: [],
		workflows: [],
		wasm_modules: undefined,
		text_blobs: undefined,
		data_blobs: undefined,
	};

	for (const [name, binding] of Object.entries(bindings)) {
		switch (binding.type) {
			case "plain_text":
				result.vars[name] = binding.value;
				break;
			case "secret_text":
				// Secrets are vars in Config
				result.vars[name] = binding.value;
				break;
			case "json":
				result.vars[name] = binding.value;
				break;
			case "kv_namespace": {
				const { type: _, ...rest } = binding;
				// INHERIT_SYMBOL never appears in programmatic config, safe to assert
				result.kv_namespaces.push({
					binding: name,
					...rest,
				} as Config["kv_namespaces"][number]);
				break;
			}
			case "durable_object_namespace": {
				const { type: _, ...rest } = binding;
				result.durable_objects.bindings.push({ name, ...rest });
				break;
			}
			case "r2_bucket": {
				const { type: _, ...rest } = binding;
				result.r2_buckets.push({
					binding: name,
					...rest,
				} as Config["r2_buckets"][number]);
				break;
			}
			case "d1": {
				const { type: _, ...rest } = binding;
				result.d1_databases.push({
					binding: name,
					...rest,
				} as Config["d1_databases"][number]);
				break;
			}
			case "service": {
				const { type: _, ...rest } = binding;
				result.services!.push({ binding: name, ...rest });
				break;
			}
			case "queue": {
				const { type: _, queue_name, ...rest } = binding;
				result.queue_producers.push({
					binding: name,
					queue: queue_name,
					...rest,
				});
				break;
			}
			case "analytics_engine": {
				const { type: _, ...rest } = binding;
				result.analytics_engine_datasets.push({ binding: name, ...rest });
				break;
			}
			case "ai": {
				const { type: _, ...rest } = binding;
				result.ai = { binding: name, ...rest };
				break;
			}
			case "images": {
				const { type: _, ...rest } = binding;
				result.images = { binding: name, ...rest };
				break;
			}
			case "media": {
				const { type: _, ...rest } = binding;
				result.media = { binding: name, ...rest };
				break;
			}
			case "version_metadata": {
				result.version_metadata = { binding: name };
				break;
			}
			case "browser": {
				const { type: _, ...rest } = binding;
				result.browser = { binding: name, ...rest };
				break;
			}
			case "send_email": {
				const { type: _, ...rest } = binding;
				result.send_email.push({ name, ...rest });
				break;
			}
			case "dispatch_namespace": {
				const { type: _, ...rest } = binding;
				result.dispatch_namespaces.push({ binding: name, ...rest });
				break;
			}
			case "mtls_certificate": {
				const { type: _, ...rest } = binding;
				result.mtls_certificates.push({ binding: name, ...rest });
				break;
			}
			case "hyperdrive": {
				const { type: _, ...rest } = binding;
				result.hyperdrive.push({ binding: name, ...rest });
				break;
			}
			case "vectorize": {
				const { type: _, ...rest } = binding;
				result.vectorize.push({ binding: name, ...rest });
				break;
			}
			case "logfwdr": {
				const { type: _, ...rest } = binding;
				result.logfwdr.push({ name, ...rest });
				break;
			}
			case "pipeline": {
				const { type: _, ...rest } = binding;
				result.pipelines.push({ binding: name, ...rest });
				break;
			}
			case "secrets_store_secret": {
				const { type: _, ...rest } = binding;
				result.secrets_store_secrets.push({ binding: name, ...rest });
				break;
			}
			case "unsafe_hello_world": {
				const { type: _, ...rest } = binding;
				result.unsafe_hello_world.push({ binding: name, ...rest });
				break;
			}
			case "ratelimit": {
				const { type: _, ...rest } = binding;
				result.ratelimits.push({ name, ...rest });
				break;
			}
			case "worker_loader": {
				const { type: _, ...rest } = binding;
				result.worker_loaders.push({ binding: name, ...rest });
				break;
			}
			case "vpc_service": {
				const { type: _, ...rest } = binding;
				result.vpc_services.push({ binding: name, ...rest });
				break;
			}
			case "workflow": {
				const { type: _, ...rest } = binding;
				result.workflows.push({ binding: name, ...rest });
				break;
			}
			case "wasm_module": {
				if (!result.wasm_modules) {
					result.wasm_modules = {};
				}
				if ("path" in binding.source) {
					result.wasm_modules[name] = binding.source.path!;
				}
				break;
			}
			case "text_blob": {
				if (!result.text_blobs) {
					result.text_blobs = {};
				}
				if ("path" in binding.source) {
					result.text_blobs[name] = binding.source.path!;
				}
				break;
			}
			case "data_blob": {
				if (!result.data_blobs) {
					result.data_blobs = {};
				}
				if ("path" in binding.source) {
					result.data_blobs[name] = binding.source.path!;
				}
				break;
			}
			case "fetcher":
				// Runtime-only binding, not representable in Config
				break;
			case "assets":
				// Handled separately via wc.assets
				break;
			case "inherit":
				// No Config equivalent
				break;
			default:
				// unsafe_* bindings are handled via config.unsafe (set separately from wc.unsafe)
				// Other unknown binding types are skipped
				break;
		}
	}

	return result;
}

// ============================================================================
// Trigger splitting
// ============================================================================

type Route = NonNullable<Config["routes"]>[number];

interface SplitTriggers {
	routes: Route[];
	crons: string[];
	queue_consumers: NonNullable<Config["queues"]["consumers"]>;
	workers_dev: boolean;
}

/**
 * Split unified Trigger[] back into Config's separate trigger fields.
 */
function splitTriggers(triggers: Trigger[]): SplitTriggers {
	const result: SplitTriggers = {
		routes: [],
		crons: [],
		queue_consumers: [],
		workers_dev: false,
	};

	for (const trigger of triggers) {
		switch (trigger.type) {
			case "route": {
				const { type: _, ...route } = trigger;
				if ("pattern" in route && Object.keys(route).length === 1) {
					// Simple route — just a pattern string
					result.routes.push(route.pattern);
				} else {
					// Zone/custom domain route — pass the object
					result.routes.push(route as Route);
				}
				break;
			}
			case "cron":
				result.crons.push(trigger.cron);
				break;
			case "queue-consumer": {
				const { type: _, ...consumer } = trigger;
				result.queue_consumers.push(consumer);
				break;
			}
			case "workers.dev":
				result.workers_dev = true;
				break;
		}
	}

	return result;
}
