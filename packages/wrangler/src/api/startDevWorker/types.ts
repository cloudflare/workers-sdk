import type { AssetsOptions } from "../../assets";
import type { CfAccount } from "../../dev/create-worker-preview";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { ConfigController } from "./ConfigController";
import type { DevEnv } from "./DevEnv";
import type { ContainerNormalizedConfig } from "@cloudflare/containers-shared";
import type {
	BinaryFile,
	Binding,
	CfModule,
	CfScriptFormat,
	CfTailConsumer,
	CfUnsafe,
	Config,
	ContainerApp,
	ContainerEngine,
	DurableObjectMigration,
	File,
	Rule,
	ServiceFetch,
	Trigger,
} from "@cloudflare/workers-utils";
import type { DispatchFetch, Miniflare, NodeJSCompatMode } from "miniflare";
import type * as undici from "undici";

type MiniflareWorker = Awaited<ReturnType<Miniflare["getWorker"]>>;
export interface Worker {
	ready: Promise<void>;
	url: Promise<URL>;
	inspectorUrl: Promise<URL | undefined>;
	config: StartDevWorkerOptions;
	setConfig: ConfigController["set"];
	patchConfig: ConfigController["patch"];
	fetch: DispatchFetch;
	scheduled: MiniflareWorker["scheduled"];
	queue: MiniflareWorker["queue"];
	dispose(): Promise<void>;
	raw: DevEnv;
}

export interface StartDevWorkerInput {
	/** The name of the worker. */
	name?: string;
	/**
	 * The javascript or typescript entry-point of the worker.
	 * This is the `main` property of a Wrangler configuration file.
	 */
	entrypoint?: string;
	/** The configuration path of the worker. */
	config?: string;

	/** The compatibility date for the workerd runtime. */
	compatibilityDate?: string;
	/** The compatibility flags for the workerd runtime. */
	compatibilityFlags?: string[];

	/** Specify the compliance region mode of the Worker. */
	complianceRegion?: Config["compliance_region"];

	/** Configuration for Python modules. */
	pythonModules?: {
		/** A list of glob patterns to exclude files from the python_modules directory when bundling. */
		exclude?: string[];
	};

	env?: string;

	/**
	 * An array of paths to the .env files to load for this worker, relative to the project directory.
	 *
	 * If not specified, defaults to the standard `.env` files as given by `getDefaultEnvFiles()`.
	 * The project directory is where the Wrangler configuration file is located or the current working directory otherwise.
	 */
	envFiles?: string[];

	/** The bindings available to the worker. The specified bindind type will be exposed to the worker on the `env` object under the same key. */
	bindings?: Record<string, Binding>; // Type level constraint for bindings not sharing names
	/**
	 * Default bindings that can be overridden by config bindings.
	 * Useful for injecting environment-specific defaults like CF_PAGES variables.
	 */
	defaultBindings?: Record<string, Extract<Binding, { type: "plain_text" }>>;
	migrations?: DurableObjectMigration[];
	containers?: ContainerApp[];
	/** The triggers which will cause the worker's exported default handlers to be called. */
	triggers?: Trigger[];

	tailConsumers?: CfTailConsumer[];
	streamingTailConsumers?: CfTailConsumer[];

	/**
	 * Whether Wrangler should send usage metrics to Cloudflare for this project.
	 *
	 * When defined this will override any user settings.
	 * Otherwise, Wrangler will use the user's preference.
	 */
	sendMetrics?: boolean;

	/** Options applying to the worker's build step. Applies to deploy and dev. */
	build?: {
		/** Whether the worker and its dependencies are bundled. Defaults to true. */
		bundle?: boolean;

		additionalModules?: CfModule[];

		findAdditionalModules?: boolean;
		processEntrypoint?: boolean;
		/** Specifies types of modules matched by globs. */
		moduleRules?: Rule[];
		/** Replace global identifiers with constant expressions, e.g. { debug: 'true', version: '"1.0.0"' }. Only takes effect if bundle: true. */
		define?: Record<string, string>;
		/** Alias modules */
		alias?: Record<string, string>;
		/** Whether the bundled worker is minified. Only takes effect if bundle: true. */
		minify?: boolean;
		/** Whether to keep function names after JavaScript transpilations. */
		keepNames?: boolean;
		/** Options controlling a custom build step. */
		custom?: {
			/** Custom shell command to run before bundling. Runs even if bundle. */
			command?: string;
			/** The cwd to run the command in. */
			workingDirectory?: string;
			/** Filepath(s) to watch for changes. Upon changes, the command will be rerun. */
			watch?: string | string[];
		};
		jsxFactory?: string;
		jsxFragment?: string;
		tsconfig?: string;
		// HACK: Resolving the nodejs compat mode is complex and fraught with backwards-compat concerns
		nodejsCompatMode?: Hook<NodeJSCompatMode, [Config]>;

		moduleRoot?: string;
	};

	/** Options applying to the worker's development preview environment. */
	dev?: {
		/** Options applying to the worker's inspector server. False disables the inspector server. */
		inspector?: { hostname?: string; port?: number; secure?: boolean } | false;
		/** Whether the worker runs on the edge or locally. This has several options:
		 *   - true | "minimal": Run your Worker's code & bindings in a remote preview session, optionally using minimal mode as an internal detail
		 *   - false: Run your Worker's code & bindings in a local simulator
		 *   - undefined (default): Run your Worker's code locally, and any configured remote bindings remotely
		 */
		remote?: boolean | "minimal";
		/** Cloudflare Account credentials. Can be provided upfront or as a function which will be called only when required. */
		auth?: AsyncHook<CfAccount, [Pick<Config, "account_id">]>; // provide config.account_id as a hook param
		/** Whether local storage (KV, Durable Objects, R2, D1, etc) is persisted. You can also specify the directory to persist data to. */
		persist?: string;
		/** Controls which logs are logged 🤙. */
		logLevel?: LogLevel;
		/** Whether the worker server restarts upon source/config file changes. */
		watch?: boolean;
		/** Whether a script tag is inserted on text/html responses which will reload the page upon file changes. Defaults to false. */
		liveReload?: boolean;

		/** The local address to reach your worker. Applies to remote: true (remote mode) and remote: false (local mode). */
		server?: {
			hostname?: string; // --ip
			port?: number; // --port
			secure?: boolean; // --local-protocol==https
			httpsKeyPath?: string;
			httpsCertPath?: string;
		};
		/** Controls what request.url looks like inside the worker. */
		origin?: { hostname?: string; secure?: boolean }; // hostname: --host (remote)/--local-upstream (local), port: doesn't make sense in remote/=== server.port in local, secure: --upstream-protocol
		/** A hook for outbound fetch calls from within the worker. */
		outboundService?: ServiceFetch;
		/** An undici MockAgent to declaratively mock fetch calls to particular resources. */
		mockFetch?: undici.MockAgent;

		testScheduled?: boolean;

		/** Treat this as the primary worker in a multiworker setup (i.e. the first Worker in Miniflare's options) */
		multiworkerPrimary?: boolean;

		containerBuildId?: string;
		/** Whether to build and connect to containers during local dev. Requires Docker daemon to be running. Defaults to true. */
		enableContainers?: boolean;

		/** Path to the dev registry directory */
		registry?: string;

		/** Path to the docker executable. Defaults to 'docker' */
		dockerPath?: string;

		/** Options for the container engine */
		containerEngine?: ContainerEngine;

		/** Re-generate your worker types when your Wrangler configuration file changes */
		generateTypes?: boolean;
	};
	legacy?: {
		site?: Hook<Config["site"], [Config]>;
		useServiceEnvironments?: boolean;
	};
	unsafe?: Omit<CfUnsafe, "bindings">;
	assets?: string;

	experimental?: {
		tailLogs: boolean;
	};
}

export type StartDevWorkerOptions = Omit<
	StartDevWorkerInput,
	"assets" | "containers"
> & {
	/** A worker's directory. Usually where the Wrangler configuration file is located */
	projectRoot: string;
	build: StartDevWorkerInput["build"] & {
		nodejsCompatMode: NodeJSCompatMode;
		format: CfScriptFormat;
		moduleRoot: string;
		moduleRules: Rule[];
		define: Record<string, string>;
		additionalModules: CfModule[];
		exports: string[];

		processEntrypoint: boolean;
	};
	legacy: StartDevWorkerInput["legacy"] & {
		site?: Config["site"];
	};
	dev: StartDevWorkerInput["dev"] & {
		persist: string;
		auth?: AsyncHook<CfAccount>; // redefine without config.account_id hook param (can only be provided by ConfigController with access to the Wrangler configuration file, not by other controllers eg RemoteRuntimeContoller)
	};
	entrypoint: string;
	assets?: AssetsOptions;
	containers?: ContainerNormalizedConfig[];
	name: string;
	complianceRegion: Config["compliance_region"];
};

export type HookValues = string | number | boolean | object | undefined | null;
export type Hook<T extends HookValues, Args extends unknown[] = []> =
	| T
	| ((...args: Args) => T);
export type AsyncHook<T extends HookValues, Args extends unknown[] = []> =
	| Hook<T, Args>
	| Hook<Promise<T>, Args>;

export type Bundle = EsbuildBundle;

export type LogLevel = "debug" | "info" | "log" | "warn" | "error" | "none";

export type { Trigger, Binding, File, BinaryFile, ServiceFetch };
