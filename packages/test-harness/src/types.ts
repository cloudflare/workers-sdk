import type { ResolvedOutputWorkerConfig } from "@cloudflare/build-output-utils";
import type {
	InferEnv,
	InferMainModule,
	ModuleType,
	UnwrapConfig,
} from "@cloudflare/config";
import type {
	D1Database,
	DurableObjectNamespace,
	ExportedHandler,
	Rpc,
	Service,
	Workflow,
} from "@cloudflare/workers-types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type {
	WorkflowInstanceIntrospector,
	WorkflowIntrospector,
} from "@cloudflare/workflows-shared/src/types";
import type {
	DurableObjectStorageHandle,
	DurableObjectStorageOptions,
	DispatchFetch,
	EmailHandlerResult,
	WorkerdStructuredLog,
} from "miniflare";

export type TestHarnessOptions = {
	/**
	 * Base directory that relative `project` paths resolve from.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | undefined;
	/**
	 * Workers to run in this server. The first worker is the primary worker.
	 */
	workers: WorkerInput[];
};

export type ExportName<Module, Type> = string extends keyof Module
	? string
	: Extract<
			{
				[K in keyof Module]-?: NonNullable<Module[K]> extends
					| Type
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match runtime class exports by instance type.
					| (abstract new (...args: any[]) => Type)
					? K
					: never;
			}[keyof Module],
			string
		>;

export type BindingName<Env, Type> = string extends keyof Env
	? string
	: Extract<
			{
				[K in keyof Env]-?: NonNullable<Env[K]> extends Type ? K : never;
			}[keyof Env],
			string
		>;
export type DurableObjectIdentifier =
	| { name: string; id?: never }
	| { id: string; name?: never };

export type FetcherEmailOptions = {
	from: string;
	to: string;
	raw: string | ReadableStream<Uint8Array>;
};

export type FetcherEmailResult = EmailHandlerResult;

export type WorkerDefaultExport =
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match workers-types Service<T> constructor constraint.
	| (new (...args: any[]) => Rpc.WorkerEntrypointBranded)
	| Rpc.WorkerEntrypointBranded
	| AnyExportedHandler;

export type WorkerModule = {
	default: WorkerDefaultExport;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Match workers-types Service<T> ExportedHandler constraint.
export type AnyExportedHandler = ExportedHandler<any, any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Untyped test code should be able to use env bindings without casting every property
export type AnyEnv = Record<string, any>;

/**
 * A Worker's config module, as `typeof import("./cloudflare.config")`
 */
export type WorkerConfigModule = { default: unknown };

/** The Worker config in a config module, read as `cf workers types` reads it */
type WorkerConfigOf<ConfigModule extends WorkerConfigModule> =
	UnwrapConfig<ConfigModule["default"]> extends { worker: infer WorkerConfig }
		? UnwrapConfig<WorkerConfig>
		: never;

/**
 * A Worker's `Env`: the given type, or the one inferred from a config module.
 */
export type WorkerEnv<EnvOrConfigModule> =
	// `any` stays `any`, so untyped tests keep working
	0 extends 1 & EnvOrConfigModule
		? EnvOrConfigModule
		: [EnvOrConfigModule] extends [WorkerConfigModule]
			? InferEnv<WorkerConfigOf<EnvOrConfigModule>>
			: EnvOrConfigModule;

/**
 * A Worker's main module: the one inferred from a config module, or any.
 */
export type WorkerMainModule<EnvOrConfigModule> = 0 extends 1 &
	EnvOrConfigModule
	? { default: AnyExportedHandler }
	: [EnvOrConfigModule] extends [WorkerConfigModule]
		? InferMainModule<
				WorkerConfigOf<EnvOrConfigModule>
			> extends infer Module extends WorkerModule
			? Module
			: { default: AnyExportedHandler }
		: { default: AnyExportedHandler };

export type WorkerHandle<
	Env = AnyEnv,
	Module extends WorkerModule = {
		default: AnyExportedHandler;
	},
> = {
	/**
	 * Dispatches a fetch event directly to this worker.
	 * Relative URL inputs are resolved against the URL returned by `listen()`.
	 *
	 * @example
	 * ```ts
	 * const response = await worker.fetch("/", {
	 *   method: "POST",
	 *   body: "Hello, world!"
	 * });
	 * ```
	 */
	fetch: DispatchFetch;
	/**
	 * Dispatches an email event directly to this Worker.
	 *
	 * @example
	 * ```ts
	 * const result = await worker.email({
	 *   from: "sender@example.com",
	 *   to: "recipient@example.com",
	 *   raw: "From: sender@example.com\\r\\n...",
	 * });
	 * ```
	 */
	email(options: FetcherEmailOptions): Promise<FetcherEmailResult>;
	/**
	 * Dispatches a scheduled event directly to this Worker.
	 *
	 * @example
	 * ```ts
	 * const result = await worker.scheduled({
	 *   cron: "0 * * * *",
	 *   scheduledTime: new Date(),
	 * });
	 * ```
	 */
	scheduled(options: FetcherScheduledOptions): Promise<FetcherScheduledResult>;
	/**
	 * Returns the full environment object configured on this Worker, including
	 * vars, secrets, and bindings.
	 *
	 * @example
	 * ```ts
	 * type Env = { GREETING: string; STORE: KVNamespace };
	 * const worker = server.getWorker<Env>();
	 * const env = await worker.getEnv();
	 * await env.STORE.put("key", env.GREETING);
	 * ```
	 */
	getEnv(): Promise<Env>;
	/**
	 * Lists the string IDs of Durable Object instances with persisted storage.
	 * Pass an exported Durable Object class name, or a Durable Object binding name.
	 */
	listDurableObjectIds(
		classNameOrBindingName:
			| ExportName<Module, Rpc.DurableObjectBranded>
			| BindingName<Env, DurableObjectNamespace>
	): Promise<string[]>;
	/**
	 * Evicts a currently running Durable Object instance while preserving its durable storage.
	 * In-memory state is reset the next time the object starts.
	 * Pass an exported Durable Object class name, or a Durable Object binding name.
	 * Class names are resolved before binding names.
	 *
	 * @example
	 * ```ts
	 * await worker.evictDurableObject("Counter", {
	 *   name: "user-123",
	 *   webSockets: "hibernate",
	 * });
	 * ```
	 */
	evictDurableObject(
		classNameOrBindingName:
			| ExportName<Module, Rpc.DurableObjectBranded>
			| BindingName<Env, DurableObjectNamespace>,
		options: DurableObjectIdentifier & {
			webSockets?: "close" | "hibernate";
		}
	): Promise<void>;
	/**
	 * Applies D1 migration files that have not already run to a D1 binding on this Worker.
	 *
	 * @example
	 * ```ts
	 * beforeEach(async () => {
	 *   await worker.applyD1Migrations("DATABASE");
	 * });
	 * ```
	 */
	applyD1Migrations(
		bindingName: BindingName<Env, D1Database>,
		options?: {
			/**
			 * Directory of the migration files. Relative paths resolve from the
			 * project directory containing the Worker's Build Output. Defaults to
			 * `./migrations`.
			 */
			dir?: string;
			/**
			 * Glob for the migration files. It starts with `dir`, so it's relative
			 * to the same project directory, or absolute when `dir` is. Defaults to
			 * `<dir>/*.sql`. Set `dir` with it, as for nested layouts such as
			 * Drizzle's.
			 */
			pattern?: string;
			/**
			 * Table that records the applied migrations. Defaults to `d1_migrations`.
			 */
			table?: string;
		}
	): Promise<void>;
	/**
	 * Returns remote storage access for a Durable Object instance.
	 * Pass an exported Durable Object class name, or a Durable Object binding name.
	 * Class names are resolved before binding names.
	 *
	 * Use this to seed state before sending requests to the object, or to inspect
	 * state after awaited requests. Calling `exec()` runs SQL inside the target
	 * Durable Object and returns all rows. It may start the object if it is not
	 * already active.
	 *
	 * @example
	 * ```ts
	 * const sql = await worker.getDurableObjectStorage("COUNTER", {
	 *   name: "user-123"
	 * });
	 * const rows = await sql.exec("SELECT count FROM counters WHERE id = ?", "user-123");
	 * ```
	 */
	getDurableObjectStorage(
		classNameOrBindingName:
			| ExportName<Module, Rpc.DurableObjectBranded>
			| BindingName<Env, DurableObjectNamespace>,
		options: DurableObjectStorageOptions
	): Promise<DurableObjectStorageHandle>;
	/**
	 * Creates an introspector for a specific Workflow instance.
	 */
	introspectWorkflowInstance(
		bindingName: BindingName<Env, Workflow>,
		instanceId: string
	): Promise<WorkflowInstanceIntrospector>;
	/**
	 * Creates an introspector for Workflow instances created after this method is called.
	 */
	introspectWorkflow(
		bindingName: BindingName<Env, Workflow>
	): Promise<WorkflowIntrospector>;
	/**
	 * Returns the default Worker export, including JSRPC methods.
	 *
	 * @example
	 * ```ts
	 * type ApiWorkerModule = typeof import("../src/api-worker");
	 *
	 * const worker = server.getWorker<Cloudflare.Env, ApiWorkerModule>("api-worker");
	 * const api = await worker.getExport();
	 * api.getMessage();
	 * ```
	 */
	getExport(): Promise<Service<Module["default"]>>;
};

export type TestHarness = {
	/**
	 * Starts the server and returns its current URL.
	 * Calling this more than once returns the same running server session until
	 * the server is closed or reset.
	 *
	 * If no options were passed to `createTestHarness()`, call `update(options)`
	 * before starting the server.
	 */
	listen(): Promise<{
		url: URL;
	}>;
	/**
	 * Dispatches a fetch request through the server.
	 *
	 * - Relative URLs are resolved against the current server URL. Absolute URLs
	 * are also accepted, and can be used to control the hostname seen by the Worker.
	 * - Requests are matched against each Worker's configured routes and dispatched to
	 * the first matching Worker, or to the primary Worker if no routes match.
	 * - To dispatch directly to a specific Worker, use `server.getWorker(name).fetch()`.
	 *
	 * @example
	 * ```ts
	 * const server = createTestHarness({
	 *   workers: [
	 *     { project: "./dashboard" }, // No route pattern
	 *     { project: "./api" }, // Route pattern: "example.com/api/*"
	 *     { project: "./admin" }, // Route pattern: "admin.example.com/*"
	 *   ]
	 * });
	 *
	 * await server.fetch("/users");
	 * // Dispatches a request to the dashboard Worker (the first Worker) with URL "http://localhost:{port}/users"
	 *
	 * await server.fetch("http://admin.example.com/accounts");
	 * // Dispatches a request to the admin Worker with URL "http://admin.example.com/accounts"
	 *
	 * await server.fetch("http://example.com/api/data");
	 * // Dispatches a request to the API Worker with URL "http://example.com/api/data"
	 * ```
	 */
	fetch: DispatchFetch;
	/**
	 * Returns a handle for dispatching events directly to a Worker.
	 * When no name is provided, this returns the primary Worker, which is the first
	 * Worker in the server's `workers` options.
	 *
	 * Type the handle with the Worker's `Env` and module types, or with its
	 * config module, from which both are inferred as `cf workers types` does.
	 *
	 * @example
	 * ```ts
	 * const api = server.getWorker<typeof import("../api/cloudflare.config")>("api");
	 * ```
	 */
	getWorker<Env = AnyEnv, Module extends WorkerModule = WorkerMainModule<Env>>(
		name?: string
	): WorkerHandle<WorkerEnv<Env>, Module>;
	/**
	 * Returns captured Workers runtime logs since the current server session
	 * started or `clearLogs()` was last called.
	 */
	getLogs(): WorkerdStructuredLog[];
	/**
	 * Clears captured Workers runtime logs.
	 */
	clearLogs(): void;
	/**
	 * Prints a diagnostic timeline for this test server.
	 *
	 * Use this to trace the sequence of server events and Workers runtime logs
	 * leading up to a test failure. Call `server.debug()` from your test runner's
	 * failure or cleanup hook when the current test has failed.
	 */
	debug(): void;
	/**
	 * Updates the server configuration and reloads the running Workers.
	 *
	 * If the server has not started yet, this configures the options that will be
	 * used by `listen()`.
	 */
	update(
		options:
			| TestHarnessOptions
			| ((currentOptions: TestHarnessOptions) => TestHarnessOptions)
	): Promise<void>;
	/**
	 * Restores the server to the options used when the current session first
	 * started. Storage is recreated, and the server URL may change after reset.
	 */
	reset(): Promise<void>;
	/**
	 * Stops the server and releases all runtime resources.
	 */
	close(): Promise<void>;
};

export type WorkerInput =
	| {
			/**
			 * The project directory containing the build's `.cloudflare/output`.
			 * Relative paths resolve from the harness's `root`.
			 */
			project: string | URL;
			/**
			 * The name of the Worker to run from that build. Defaults to the build's
			 * default Worker.
			 */
			name?: string;
			/**
			 * Test-only bindings that replace the Worker's bindings of the same
			 * name, such as `bindings.text("test")` for a secret, or
			 * `bindings.worker({ worker: "mock-ai" })` for a Worker in this test
			 * harness. As in `cloudflare.config.ts`, entries set to `false`, `null`,
			 * or `undefined` are omitted, so they remove the Worker's binding.
			 */
			envOverrides?: Record<string, WorkerBinding | false | null | undefined>;
	  }
	| {
			/**
			 * Inline config for a test-only Worker, such as a mock for a binding in
			 * `envOverrides`. Its files resolve from the harness's `root`.
			 */
			config: InlineWorkerConfig;
	  };

/** A binding in the shape of `env` in a Build Output's `worker.config.json` */
type WorkerBinding = NonNullable<ResolvedOutputWorkerConfig["env"]>[string];

/**
 * A Worker config in the shape of a Build Output's `worker.config.json`, whose
 * `manifest` includes the code of each module. Inline modules aren't bundled.
 *
 * @example
 * ```ts
 * {
 *   name: "mock-ai",
 *   compatibilityDate: "2026-06-01",
 *   manifest: {
 *     mainModule: "index.js",
 *     modules: {
 *       "index.js": { type: "esm", contents: "export default { ... }" },
 *     },
 *   },
 * }
 * ```
 */
export type InlineWorkerConfig = Omit<
	ResolvedOutputWorkerConfig,
	// Inline Workers have no assets directory
	"manifest" | "assets"
> & {
	manifest: {
		mainModule: string;
		modules: Record<
			string,
			{
				type: ModuleType;
				contents: string | Uint8Array;
			}
		>;
	};
};
