import type { Config } from "../../config";
import type {
	CustomDomainRoute,
	Rule,
	ZoneIdRoute,
	ZoneNameRoute,
} from "../../config/environment";
import type { NodeJSCompatMode } from "../../deployment-bundle/node-compat";
import type {
	CfAnalyticsEngineDataset,
	CfConstellation,
	CfD1Database,
	CfDispatchNamespace,
	CfDurableObject,
	CfHyperdrive,
	CfKvNamespace,
	CfLogfwdrBinding,
	CfModule,
	CfMTlsCertificate,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfSendEmailBindings,
	CfService,
	CfUnsafe,
	CfVectorize,
} from "../../deployment-bundle/worker";
import type { WorkerDefinition } from "../../dev-registry";
import type { CfAccount } from "../../dev/create-worker-preview";
import type { EsbuildBundle } from "../../dev/use-esbuild";
import type { ConfigController } from "./ConfigController";
import type { DispatchFetch, Json, Request, Response } from "miniflare";
import type * as undici from "undici";

export interface DevWorker {
	ready: Promise<void>;
	config?: StartDevWorkerOptions;
	setConfig: ConfigController["set"];
	patchConfig: ConfigController["patch"];
	fetch: DispatchFetch;
	scheduled(cron?: string): Promise<void>;
	queue(queueName: string, ...messages: unknown[]): Promise<void>;
	dispose(): Promise<void>;
}

export interface StartDevWorkerOptions {
	/** The name of the worker. */
	name?: string;
	/**
	 * The javascript or typescript entry-point of the worker.
	 * This is the `main` property of a wrangler.toml.
	 * You can specify a file path or provide the contents directly.
	 */
	entrypoint?: FilePath;
	/** The configuration of the worker. */
	config?: FilePath;
	/** A worker's directory. Usually where the wrangler.toml file is located */
	directory?: string;
	/** The compatibility date for the workerd runtime. */
	compatibilityDate?: string;
	/** The compatibility flags for the workerd runtime. */
	compatibilityFlags?: string[];

	env?: string;

	/** The bindings available to the worker. The specified bindind type will be exposed to the worker on the `env` object under the same key. */
	bindings?: Record<string, Binding>; // Type level constraint for bindings not sharing names
	/** The triggers which will cause the worker's exported default handlers to be called. */
	triggers?: Trigger[];

	/**
	 * Whether Wrangler should send usage metrics to Cloudflare for this project.
	 *
	 * When defined this will override any user settings.
	 * Otherwise, Wrangler will use the user's preference.
	 */
	sendMetrics?: boolean;
	usageModel?: "bundled" | "unbound";

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
		/** Whether the bundled worker is minified. Only takes effect if bundle: true. */
		minify?: boolean;
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
		nodejsCompatMode?: NodeJSCompatMode;
		moduleRoot?: string;

		format?: CfScriptFormat;
	};

	/** Options applying to the worker's development preview environment. */
	dev?: {
		/** Options applying to the worker's inspector server. */
		inspector?: { hostname?: string; port?: number; secure?: boolean };
		/** Whether the worker runs on the edge or locally. */
		remote?: boolean;
		/** Cloudflare Account credentials. Can be provided upfront or as a function which will be called only when required. */
		auth?: AsyncHook<CfAccount>;
		/** Whether local storage (KV, Durable Objects, R2, D1, etc) is persisted. You can also specify the directory to persist data to. */
		persist?: boolean | { path: string };
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

		/** Gets a fetcher to a specific worker, used for multi-worker development */
		getRegisteredWorker?(name: string): WorkerDefinition | undefined;

		testScheduled?: boolean;
	};
	legacy?: {
		site?: Config["site"];
		assets?: Config["assets"];
		enableServiceEnvironments?: boolean;
	};
	unsafe?: Omit<CfUnsafe, "bindings">;
}

export type HookValues = string | number | boolean | object;
export type Hook<T extends HookValues, Args extends unknown[] = []> =
	| T
	| ((...args: Args) => T);
export type AsyncHook<T extends HookValues, Args extends unknown[] = []> =
	| Hook<T, Args>
	| Hook<Promise<T>, Args>;

export type Bundle = EsbuildBundle;

export type LogLevel = "debug" | "info" | "log" | "warn" | "error" | "none";

export type File<Contents = string, Path = string> =
	| { path: Path } // `path` resolved relative to cwd
	| { contents: Contents; path?: Path }; // `contents` used instead, `path` can be specified if needed e.g. for module resolution
export type BinaryFile = File<Uint8Array>; // Note: Node's `Buffer`s are instances of `Uint8Array`
export type FilePath<Path = string> = Extract<
	File<undefined, Path>,
	{ path: Path }
>; // file that must be on disk -- reminder to allow uses of `contents` eventually

export interface Location {
	hostname?: string;
	port?: number;
	secure?: boolean; // Usually `https`, but could be `wss` for inspector
}

export type PatternRoute = {
	pattern: string;
} & (
	| { pattern: string; customDomain: true }
	| { pattern: string; zoneId: string; customDomain?: true; zoneName?: never }
	| { pattern: string; zoneName: string; customDomain?: true; zoneId?: never }
);
export type WorkersDevRoute = { workersDev: true };
export type Route = PatternRoute | WorkersDevRoute;

type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];

export type Trigger =
	| { type: "workers.dev" }
	| { type: "route"; pattern: string } // SimpleRoute
	| ({ type: "route" } & ZoneIdRoute)
	| ({ type: "route" } & ZoneNameRoute)
	| ({ type: "route" } & CustomDomainRoute)
	| { type: "cron"; cron: string }
	| ({ type: "queue-consumer" } & QueueConsumer);

type BindingOmit<T> = Omit<T, "binding" | "name">;
export type Binding =
	| { type: "plain_text"; value: string }
	| { type: "json"; value: Json }
	| ({ type: "kv_namespace" } & BindingOmit<CfKvNamespace>)
	| ({ type: "send_email" } & BindingOmit<CfSendEmailBindings>)
	| { type: "wasm_module"; source: BinaryFile }
	| { type: "text_blob"; source: File }
	| { type: "browser" }
	| { type: "ai" }
	| { type: "version_metadata" }
	| { type: "data_blob"; source: BinaryFile }
	| ({ type: "durable_object_namespace" } & BindingOmit<CfDurableObject>)
	| ({ type: "queue" } & BindingOmit<CfQueue>)
	| ({ type: "r2_bucket" } & BindingOmit<CfR2Bucket>)
	| ({ type: "d1" } & Omit<CfD1Database, "binding">)
	| ({ type: "vectorize" } & Omit<CfVectorize, "binding">)
	| ({ type: "constellation" } & Omit<CfConstellation, "binding">)
	| ({ type: "hyperdrive" } & Omit<CfHyperdrive, "binding">)
	| ({ type: "service" } & Omit<CfService, "binding">)
	| { type: "fetcher"; fetcher: ServiceFetch }
	| ({ type: "analytics_engine" } & Omit<CfAnalyticsEngineDataset, "binding">)
	| ({ type: "dispatch_namespace" } & Omit<CfDispatchNamespace, "binding">)
	| ({ type: "mtls_certificate" } & Omit<CfMTlsCertificate, "binding">)
	| ({ type: "logfwdr" } & Omit<CfLogfwdrBinding, "name">)
	| { type: `unsafe_${string}` };

export type ServiceFetch = (request: Request) => Promise<Response> | Response;

export interface ServiceDesignator {
	name: string;
	env?: string;
}
