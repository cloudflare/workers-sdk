import type {
	ContainerEngine,
	Environment,
	RawEnvironment,
} from "./environment";

/**
 * This is the static type definition for the configuration object.
 *
 * It reflects a normalized and validated version of the configuration that you can write in a Wrangler configuration file,
 * and optionally augment with arguments passed directly to wrangler.
 *
 * For more information about the configuration object, see the
 * documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration
 *
 * Notes:
 *
 * - Fields that are only specified in `ConfigFields` and not `Environment` can only appear
 *   in the top level config and should not appear in any environments.
 * - Fields that are specified in `PagesConfigFields` are only relevant for Pages projects
 * - All top level fields in config and environments are optional in the Wrangler configuration file.
 *
 * Legend for the annotations:
 *
 * - `@breaking`: the deprecation/optionality is a breaking change from Wrangler v1.
 * - `@todo`: there's more work to be done (with details attached).
 */
export type Config = ComputedFields &
	ConfigFields<DevConfig> &
	PagesConfigFields &
	Environment;

export type RawConfig = Partial<ConfigFields<RawDevConfig>> &
	PagesConfigFields &
	RawEnvironment &
	EnvironmentMap & { $schema?: string };

export type RedirectedRawConfig = RawConfig & Partial<ComputedFields>;

export interface ComputedFields {
	/** The path to the Wrangler configuration file (if any, and possibly redirected from the user Wrangler configuration) used to create this configuration. */
	configPath: string | undefined;
	/** The path to the user's Wrangler configuration file (if any), which may have been redirected to another file that used to create this configuration. */
	userConfigPath: string | undefined;
	/**
	 * The original top level name for the Worker in the raw configuration.
	 *
	 * When a raw configuration has been flattened to a single environment the worker name may have been replaced or transformed.
	 * It can be useful to know what the top-level name was before the flattening.
	 */
	topLevelName: string | undefined;
	/** A list of environment names declared in the raw configuration. */
	definedEnvironments: string[] | undefined;
	/** The name of the environment being targeted. */
	targetEnvironment: string | undefined;
}

export interface ConfigFields<Dev extends RawDevConfig> {
	/**
	 * A boolean to enable "legacy" style wrangler environments (from Wrangler v1).
	 * These have been superseded by Services, but there may be projects that won't
	 * (or can't) use them. If you're using a legacy environment, you can set this
	 * to `true` to enable it.
	 */
	legacy_env: boolean;

	/**
	 * Whether Wrangler should send usage metrics to Cloudflare for this project.
	 *
	 * When defined this will override any user settings.
	 * Otherwise, Wrangler will use the user's preference.
	 */
	send_metrics: boolean | undefined;

	/**
	 * Options to configure the development server that your worker will use.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#local-development-settings
	 */
	dev: Dev;

	/**
	 * The definition of a Worker Site, a feature that lets you upload
	 * static assets with your Worker.
	 *
	 * More details at https://developers.cloudflare.com/workers/platform/sites
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-sites
	 */
	site:
		| {
				/**
				 * The directory containing your static assets.
				 *
				 * It must be a path relative to your Wrangler configuration file.
				 * Example: bucket = "./public"
				 *
				 * If there is a `site` field then it must contain this `bucket` field.
				 */
				bucket: string;

				/**
				 * The location of your Worker script.
				 *
				 * @deprecated DO NOT use this (it's a holdover from Wrangler v1.x). Either use the top level `main` field, or pass the path to your entry file as a command line argument.
				 * @breaking
				 */
				"entry-point"?: string;

				/**
				 * An exclusive list of .gitignore-style patterns that match file
				 * or directory names from your bucket location. Only matched
				 * items will be uploaded. Example: include = ["upload_dir"]
				 *
				 * @optional
				 * @default []
				 */
				include?: string[];

				/**
				 * A list of .gitignore-style patterns that match files or
				 * directories in your bucket that should be excluded from
				 * uploads. Example: exclude = ["ignore_dir"]
				 *
				 * @optional
				 * @default []
				 */
				exclude?: string[];
		  }
		| undefined;

	/**
	 * A list of wasm modules that your worker should be bound to. This is
	 * the "legacy" way of binding to a wasm module. ES module workers should
	 * do proper module imports.
	 */
	wasm_modules:
		| {
				[key: string]: string;
		  }
		| undefined;

	/**
	 * A list of text files that your worker should be bound to. This is
	 * the "legacy" way of binding to a text file. ES module workers should
	 * do proper module imports.
	 */
	text_blobs:
		| {
				[key: string]: string;
		  }
		| undefined;

	/**
	 * A list of data files that your worker should be bound to. This is
	 * the "legacy" way of binding to a data file. ES module workers should
	 * do proper module imports.
	 */
	data_blobs:
		| {
				[key: string]: string;
		  }
		| undefined;

	/**
	 * A map of module aliases. Lets you swap out a module for any others.
	 * Corresponds with esbuild's `alias` config
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#module-aliasing
	 */
	alias: { [key: string]: string } | undefined;

	/**
	 * By default, the Wrangler configuration file is the source of truth for your environment configuration, like a terraform file.
	 *
	 * If you change your vars in the dashboard, wrangler *will* override/delete them on its next deploy.
	 *
	 * If you want to keep your dashboard vars when wrangler deploys, set this field to true.
	 *
	 * @default false
	 * @nonInheritable
	 */
	keep_vars?: boolean;
}

// Pages-specific configuration fields
interface PagesConfigFields {
	/**
	 * The directory of static assets to serve.
	 *
	 * The presence of this field in a Wrangler configuration file indicates a Pages project,
	 * and will prompt the handling of the configuration file according to the
	 * Pages-specific validation rules.
	 */
	pages_build_output_dir?: string;
}

export interface DevConfig {
	/**
	 * IP address for the local dev server to listen on,
	 *
	 * @default localhost
	 */
	ip: string;

	/**
	 * Port for the local dev server to listen on
	 *
	 * @default 8787
	 */
	port: number | undefined;

	/**
	 * Port for the local dev server's inspector to listen on
	 *
	 * @default 9229
	 */
	inspector_port: number | undefined;

	/**
	 * IP address for the local dev server's inspector to listen on
	 *
	 * @default 127.0.0.1
	 */
	inspector_ip: string | undefined;

	/**
	 * Protocol that local wrangler dev server listens to requests on.
	 *
	 * @default http
	 */
	local_protocol: "http" | "https";

	/**
	 * Protocol that wrangler dev forwards requests on
	 *
	 * Setting this to `http` is not currently implemented for remote mode.
	 * See https://github.com/cloudflare/workers-sdk/issues/583
	 *
	 * @default https
	 */
	upstream_protocol: "https" | "http";

	/**
	 * Host to forward requests to, defaults to the host of the first route of project
	 */
	host: string | undefined;

	/**
	 * When developing, whether to build and connect to containers. This requires a Docker daemon to be running.
	 * Defaults to `true`.
	 *
	 * @default true
	 */
	enable_containers: boolean;

	/**
	 * Either the Docker unix socket i.e. `unix:///var/run/docker.sock` or a full configuration.
	 * Note that windows is only supported via WSL at the moment
	 */
	container_engine: ContainerEngine | undefined;

	/**
	 * Re-generate your worker types when your Wrangler configuration file changes.
	 *
	 * @default false
	 */
	generate_types: boolean;
}

export type RawDevConfig = Partial<DevConfig>;

interface EnvironmentMap {
	/**
	 * The `env` section defines overrides for the configuration for different environments.
	 *
	 * All environment fields can be specified at the top level of the config indicating the default environment settings.
	 *
	 * - Some fields are inherited and overridable in each environment.
	 * - But some are not inherited and must be explicitly specified in every environment, if they are specified at the top level.
	 *
	 * For more information, see the documentation at https://developers.cloudflare.com/workers/cli-wrangler/configuration#environments
	 *
	 * @default {}
	 */
	env?: {
		[envName: string]: RawEnvironment;
	};
}

export const defaultWranglerConfig: Config = {
	/* COMPUTED_FIELDS */
	configPath: undefined,
	userConfigPath: undefined,
	topLevelName: undefined,
	definedEnvironments: undefined,
	targetEnvironment: undefined,

	/*====================================================*/
	/*      Fields supported by both Workers & Pages      */
	/*====================================================*/
	/* TOP-LEVEL ONLY FIELDS */
	pages_build_output_dir: undefined,
	send_metrics: undefined,
	dev: {
		ip: process.platform === "win32" ? "127.0.0.1" : "localhost",
		port: undefined, // the default of 8787 is set at runtime
		inspector_port: undefined, // the default of 9229 is set at runtime
		inspector_ip: undefined, // the default of 127.0.0.1 is set at runtime
		local_protocol: "http",
		upstream_protocol: "http",
		host: undefined,
		// Note this one is also workers only
		enable_containers: true,
		container_engine: undefined,
		generate_types: false,
	},

	/** INHERITABLE ENVIRONMENT FIELDS **/
	name: undefined,
	compatibility_date: undefined,
	compatibility_flags: [],
	limits: undefined,
	placement: undefined,

	/** NON-INHERITABLE ENVIRONMENT FIELDS **/
	vars: {},
	durable_objects: { bindings: [] },
	kv_namespaces: [],
	queues: {
		producers: [],
		consumers: [], // WORKERS SUPPORT ONLY!!
	},
	r2_buckets: [],
	d1_databases: [],
	vectorize: [],
	hyperdrive: [],
	workflows: [],
	secrets_store_secrets: [],
	services: [],
	analytics_engine_datasets: [],
	ai: undefined,
	images: undefined,
	media: undefined,
	version_metadata: undefined,
	unsafe_hello_world: [],
	ratelimits: [],
	worker_loaders: [],

	/*====================================================*/
	/*           Fields supported by Workers only         */
	/*====================================================*/
	/* TOP-LEVEL ONLY FIELDS */
	legacy_env: true,
	site: undefined,
	wasm_modules: undefined,
	text_blobs: undefined,
	data_blobs: undefined,
	keep_vars: undefined,
	alias: undefined,

	/** INHERITABLE ENVIRONMENT FIELDS **/
	account_id: undefined,
	main: undefined,
	find_additional_modules: undefined,
	preserve_file_names: undefined,
	base_dir: undefined,
	workers_dev: undefined,
	preview_urls: undefined,
	route: undefined,
	routes: undefined,
	tsconfig: undefined,
	jsx_factory: "React.createElement",
	jsx_fragment: "React.Fragment",
	migrations: [],
	triggers: {
		crons: undefined,
	},
	rules: [],
	build: { command: undefined, watch_dir: "./src", cwd: undefined },
	no_bundle: undefined,
	minify: undefined,
	keep_names: undefined,
	dispatch_namespaces: [],
	first_party_worker: undefined,
	logfwdr: { bindings: [] },
	logpush: undefined,
	upload_source_maps: undefined,
	assets: undefined,
	observability: { enabled: true },
	/** The default here is undefined so that we can delegate to the CLOUDFLARE_COMPLIANCE_REGION environment variable. */
	compliance_region: undefined,
	python_modules: { exclude: ["**/*.pyc"] },

	/** NON-INHERITABLE ENVIRONMENT FIELDS **/
	define: {},
	cloudchamber: {},
	containers: undefined,
	send_email: [],
	browser: undefined,
	unsafe: {},
	mtls_certificates: [],
	tail_consumers: undefined,
	streaming_tail_consumers: undefined,
	pipelines: [],
	vpc_services: [],
};
