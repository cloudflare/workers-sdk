import assert from "node:assert";
import { resolveDockerHost } from "@cloudflare/containers-shared";
import { readD1Migrations } from "@cloudflare/workers-utils";
import { applyD1Migrations } from "@cloudflare/workers-utils/apply-d1-migrations";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { CorePaths, Headers, Miniflare, Request } from "miniflare";
import {
	createHarnessContext,
	disposeRemoteProxySessions,
	resolveWorkerInputs,
} from "./runtime";
import type { ResolvedWorker } from "./runtime";
import type { ResolvedOutputWorkerConfig } from "@cloudflare/build-output-utils";
import type {
	InferEnv,
	InferMainModule,
	UnwrapConfig,
} from "@cloudflare/config";
import type {
	D1Database,
	ExportedHandler,
	Rpc,
	Service,
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
	MiniflareOptions,
	RequestInfo,
	Response,
	WorkerdStructuredLog,
	WorkerOptions,
} from "miniflare";

export type TestHarnessOptions = {
	/**
	 * Base directory that relative `projectDir` paths resolve from.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | undefined;
	/**
	 * Workers to run in this harness. The first worker is the primary worker.
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

/**
 * A stub to a Worker's default export, typed from the export itself or from
 * the methods a test gives. An untyped export's `any` stays `any`, so it has
 * any RPC method.
 */
type WorkerExport<Export> = 0 extends 1 & Export
	? Export
	: Export extends WorkerDefaultExport
		? Service<Export>
		: Export extends object
			? // As `Service<T>` types a WorkerEntrypoint's methods
				Rpc.Provider<Export, "fetch" | "connect"> & Service
			: never;

/**
 * A Worker's config module, as `typeof import("./cloudflare.config")`
 */
type WorkerConfigModule = { default: unknown };

/** The Worker config in a config module, read as `cf workers types` reads it */
type WorkerConfigOf<ConfigModule extends WorkerConfigModule> =
	UnwrapConfig<ConfigModule["default"]> extends { worker: infer WorkerConfig }
		? UnwrapConfig<WorkerConfig>
		: never;

/**
 * A Worker's `Env`, inferred from its config module. An untyped handle's
 * `any` stays `any`.
 */
type WorkerEnv<ConfigModule extends WorkerConfigModule> = 0 extends 1 &
	ConfigModule
	? ConfigModule
	: InferEnv<WorkerConfigOf<ConfigModule>>;

/**
 * A Worker's main module, inferred from its config module. An untyped
 * handle's `any` stays `any`.
 */
type WorkerMainModule<ConfigModule extends WorkerConfigModule> = 0 extends 1 &
	ConfigModule
	? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- An untyped handle has any export
		any
	: InferMainModule<WorkerConfigOf<ConfigModule>> extends infer Module extends
				WorkerModule
		? Module
		: never;

export type WorkerHandle<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An untyped handle has any binding and export
	Env = any,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An untyped handle has any binding and export
	Module extends WorkerModule = any,
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
	 * vars, secrets, and bindings. Its type comes from the handle's config
	 * module, or can be given here.
	 *
	 * @example
	 * ```ts
	 * type Env = { GREETING: string; STORE: KVNamespace };
	 * const env = await harness.getWorker().getEnv<Env>();
	 * await env.STORE.put("key", env.GREETING);
	 * ```
	 */
	getEnv<WorkerEnvType = Env>(): Promise<WorkerEnvType>;
	/**
	 * Lists the string IDs of Durable Object instances with persisted storage.
	 * Pass the Durable Object's export name.
	 */
	listDurableObjectIds(
		exportName: ExportName<Module, Rpc.DurableObjectBranded>
	): Promise<string[]>;
	/**
	 * Evicts a currently running Durable Object instance while preserving its durable storage.
	 * In-memory state is reset the next time the object starts.
	 * Pass the Durable Object's export name.
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
		exportName: ExportName<Module, Rpc.DurableObjectBranded>,
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
	 * Pass the Durable Object's export name.
	 *
	 * Use this to seed state before sending requests to the object, or to inspect
	 * state after awaited requests. Calling `exec()` runs SQL inside the target
	 * Durable Object and returns all rows. It may start the object if it is not
	 * already active.
	 *
	 * @example
	 * ```ts
	 * const sql = await worker.getDurableObjectStorage("Counter", {
	 *   name: "user-123"
	 * });
	 * const rows = await sql.exec("SELECT count FROM counters WHERE id = ?", "user-123");
	 * ```
	 */
	getDurableObjectStorage(
		exportName: ExportName<Module, Rpc.DurableObjectBranded>,
		options: DurableObjectStorageOptions
	): Promise<DurableObjectStorageHandle>;
	/**
	 * Creates an introspector for a specific Workflow instance.
	 * Pass the Workflow's export name.
	 */
	introspectWorkflowInstance(
		exportName: ExportName<Module, Rpc.WorkflowEntrypointBranded>,
		instanceId: string
	): Promise<WorkflowInstanceIntrospector>;
	/**
	 * Creates an introspector for Workflow instances created after this method is called.
	 * Pass the Workflow's export name.
	 */
	introspectWorkflow(
		exportName: ExportName<Module, Rpc.WorkflowEntrypointBranded>
	): Promise<WorkflowIntrospector>;
	/**
	 * Returns the default Worker export, including JSRPC methods. Its type comes
	 * from the handle's config module, or can be given here.
	 *
	 * @example
	 * ```ts
	 * type ApiWorker = { getMessage(): string };
	 *
	 * const api = await harness.getWorker("api-worker").getExport<ApiWorker>();
	 * api.getMessage();
	 * ```
	 */
	getExport<Export = Module["default"]>(): Promise<WorkerExport<Export>>;
};

export type TestHarness = {
	/**
	 * Starts the server and returns its current URL.
	 * Calling this more than once returns the same running session until the
	 * harness is closed or reset.
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
	 * - To dispatch directly to a specific Worker, use `harness.getWorker(name).fetch()`.
	 *
	 * @example
	 * ```ts
	 * const harness = createTestHarness({
	 *   workers: [
	 *     { projectDir: "./dashboard" }, // No route pattern
	 *     { projectDir: "./api" }, // Route pattern: "example.com/api/*"
	 *     { projectDir: "./admin" }, // Route pattern: "admin.example.com/*"
	 *   ]
	 * });
	 *
	 * await harness.fetch("/users");
	 * // Dispatches a request to the dashboard Worker (the first Worker) with URL "http://localhost:{port}/users"
	 *
	 * await harness.fetch("http://admin.example.com/accounts");
	 * // Dispatches a request to the admin Worker with URL "http://admin.example.com/accounts"
	 *
	 * await harness.fetch("http://example.com/api/data");
	 * // Dispatches a request to the API Worker with URL "http://example.com/api/data"
	 * ```
	 */
	fetch: DispatchFetch;
	/**
	 * Returns a handle for dispatching events directly to a Worker.
	 * When no name is provided, this returns the primary Worker, which is the first
	 * Worker in the harness's `workers` options.
	 *
	 * Type the handle with the Worker's config module, from which its `Env` and
	 * module are inferred as `cf workers types` does. Without one, bindings and
	 * the export's methods are `any`; `getEnv()` and `getExport()` also take
	 * their types directly.
	 *
	 * @example
	 * ```ts
	 * const api = harness.getWorker<typeof import("../api/cloudflare.config")>("api");
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An untyped handle has any binding and export
	getWorker<ConfigModule extends WorkerConfigModule = any>(
		name?: string
	): WorkerHandle<WorkerEnv<ConfigModule>, WorkerMainModule<ConfigModule>>;
	/**
	 * Returns captured Workers runtime logs since the current session
	 * started or `clearLogs()` was last called.
	 */
	getLogs(): WorkerdStructuredLog[];
	/**
	 * Clears captured Workers runtime logs.
	 */
	clearLogs(): void;
	/**
	 * Prints a diagnostic timeline for this test harness.
	 *
	 * Use this to trace the sequence of server events and Workers runtime logs
	 * leading up to a test failure. Call `harness.debug()` from your test runner's
	 * failure or cleanup hook when the current test has failed.
	 */
	debug(): void;
	/**
	 * Updates the harness's options and reloads the running Workers.
	 *
	 * If the harness has not started yet, this configures the options that will
	 * be used by `listen()`.
	 */
	update(
		options:
			| TestHarnessOptions
			| ((currentOptions: TestHarnessOptions) => TestHarnessOptions)
	): Promise<void>;
	/**
	 * Restores the harness to the options used when the current session first
	 * started. Storage is recreated, and the server URL may change after reset.
	 */
	reset(): Promise<void>;
	/**
	 * Stops the harness and releases all runtime resources.
	 */
	close(): Promise<void>;
};

export type WorkerInput =
	| {
			/**
			 * The project directory containing the build's `.cloudflare/output`.
			 * Relative paths resolve from the harness's `root`.
			 */
			projectDir: string | URL;
			/**
			 * The name of the Worker to run from that build. Defaults to the build's
			 * default Worker.
			 */
			name?: string;
			/**
			 * Test-only bindings that replace the Worker's bindings of the same
			 * name, such as `bindings.text("test")` for a secret, or
			 * `bindings.worker({ worker: "mock-ai" })` for a Worker in this test
			 * harness. Each name must be a binding the Worker declares. A var or
			 * secret takes `bindings.text()` or `bindings.json()`, a Durable Object
			 * takes another Durable Object, and any other binding takes one of its
			 * own type, or `bindings.worker()` to mock it.
			 */
			envOverrides?: Record<string, WorkerBinding>;
	  }
	| {
			/**
			 * Miniflare's config for a test-only Worker, such as a mock for a
			 * binding in `envOverrides`. Miniflare runs it as given: each module's
			 * code is in `manifest`, and bindings take the values to use, such as
			 * `{ type: "text", value }` rather than a secret. D1 migrations are
			 * read from the harness's `root`.
			 */
			config: WorkerOptions["config"];
	  };

/** A binding in the shape of `env` in a Build Output's `worker.config.json` */
type WorkerBinding = NonNullable<ResolvedOutputWorkerConfig["env"]>[string];

type ServerSession = {
	miniflare?: Miniflare;
	workers: ResolvedWorker[];
};

type DebugLog = {
	source: "server" | "runtime";
	worker?: string;
	level?: string;
	message: string;
	timestamp: number;
};

/**
 * Creates a test harness that runs Workers from their projects' Build Output.
 *
 * The harness can run one or more Workers, behind one local server.
 *
 * @example
 * ```ts
 * const harness = createTestHarness({
 *   workers: [{ projectDir: "./" }],
 * });
 * await harness.listen();
 * const response = await harness.fetch("/api/users");
 * await harness.close();
 * ```
 */
export function createTestHarness(options?: TestHarnessOptions): TestHarness {
	let initialOptions = options;
	const ctx = createHarnessContext();
	let currentOptions = options;
	let serverSession: ServerSession | undefined;
	let startPromise: Promise<ServerSession> | undefined;
	let workerdLogs: WorkerdStructuredLog[] = [];
	let debugLogs: DebugLog[] = [];

	function debugLog(message: string, worker?: string) {
		debugLogs.push({
			source: "server",
			worker,
			message,
			timestamp: Date.now(),
		});
	}

	function captureStructuredLog(log: WorkerdStructuredLog) {
		workerdLogs.push(log);
		debugLogs.push({
			source: "runtime",
			level: log.level,
			message: log.message,
			timestamp: log.timestamp,
		});
	}

	function formatLocalTimestamp(timestamp: number) {
		const date = new Date(timestamp);
		const pad = (value: number) => String(value).padStart(2, "0");

		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	}

	function getMiniflareOptions(workers: ResolvedWorker[]): MiniflareOptions {
		const hasContainers = workers.some((worker) =>
			Object.values(worker.options.config.exports ?? {}).some(
				(workerExport) =>
					"container" in workerExport && workerExport.container !== undefined
			)
		);
		return {
			host: "127.0.0.1",
			port: 0,
			enableDevRegistry: false,
			unsafeTriggerHandlers: true,
			unsafeInspectDurableObjects: true,
			// As in `vite preview`
			containerEngine: hasContainers
				? resolveDockerHost(getDockerPath())
				: undefined,
			handleStructuredLogs: (log: WorkerdStructuredLog) =>
				captureStructuredLog(log),
			workers: workers.map((worker) => ({
				...worker.options,
				dev: {
					...worker.options.dev,
					outboundService: {
						type: "fetcher",
						handler: (request) => {
							/**
							 * Miniflare passes its own undici-based Request here. Pass the URL as
							 * RequestInfo and the request as RequestInit so method, headers, body,
							 * and duplex are preserved by global fetch. Make that a global Request
							 * first: MSW's fetch interceptor spreads `init`, which drops the
							 * headers of a Request passed as `init`.
							 */
							return globalThis.fetch(
								new globalThis.Request(request.url, request)
								// Miniflare takes Node's Response too, but its type only names its own
							) as Promise<unknown> as Promise<Response>;
						},
					},
				},
			})),
		};
	}

	async function createSession(
		serverOptions: TestHarnessOptions
	): Promise<ServerSession> {
		const session: ServerSession = { workers: [] };
		try {
			debugLog("startup - started");
			session.workers = await resolveWorkerInputs(ctx, serverOptions);
			session.miniflare = new Miniflare(getMiniflareOptions(session.workers));
			await session.miniflare.ready;
			debugLog("startup - completed");
			return session;
		} catch (error) {
			debugLog("startup - failed");
			await teardownSession(session);
			throw error;
		}
	}

	async function updateConfig(
		session: ServerSession,
		serverOptions: TestHarnessOptions
	) {
		const miniflare = await getRuntimeMiniflare(session);
		const previousWorkers = session.workers;
		session.workers = await resolveWorkerInputs(
			ctx,
			serverOptions,
			previousWorkers
		);
		// Workers that the update removes, or replaces with inline ones, no longer
		// need their remote sessions
		const workerNamesWithSessions = new Set(
			session.workers
				.filter((worker) => worker.remoteProxySessionData)
				.map((worker) => worker.options.config.name)
		);
		await disposeRemoteProxySessions(
			previousWorkers.filter(
				(worker) => !workerNamesWithSessions.has(worker.options.config.name)
			)
		);
		await miniflare.setOptions(getMiniflareOptions(session.workers));
	}

	async function resolveSession() {
		if (startPromise) {
			return await startPromise;
		}

		assert(
			serverSession,
			"Test harness has not been started. Start it with harness.listen() before calling this method."
		);

		return serverSession;
	}

	function resolveWorkerName(
		session: ServerSession,
		workerName: string | undefined
	) {
		if (workerName === undefined) {
			const primaryWorkerName = session.workers[0]?.options.config.name;
			assert(
				primaryWorkerName,
				"Primary Worker name is not available. Add a Worker `name` or call harness.getWorker(name)."
			);
			return primaryWorkerName;
		}

		const workerExists = session.workers.some((worker) => {
			return worker.options.config.name === workerName;
		});

		if (!workerExists) {
			throw new TypeError(
				`Worker ${JSON.stringify(workerName)} does not exist in this server.`
			);
		}

		return workerName;
	}

	function assertDurableObjectExport(
		session: ServerSession,
		workerName: string,
		exportName: string
	) {
		// Build Output declares Durable Object classes in `exports`, rather than
		// in migrations. Exports with `storage` are the live classes.
		const durableObjectClass = getResolvedWorker(session, workerName).options
			.config.exports?.[exportName];
		if (
			durableObjectClass?.type !== "durable-object" ||
			!("storage" in durableObjectClass)
		) {
			throw new TypeError(
				`No Durable Object class named ${JSON.stringify(exportName)} found in ${JSON.stringify(workerName)} worker.`
			);
		}
	}

	async function teardownSession(session: ServerSession) {
		try {
			debugLog("teardown - started");
			try {
				// Rethrows a failed start's error
				await session.miniflare?.dispose();
			} finally {
				await disposeRemoteProxySessions(session.workers);
			}
			debugLog("teardown - completed");
		} catch (error) {
			debugLog("teardown - failed");
			throw error;
		} finally {
			if (session === serverSession) {
				serverSession = undefined;
			}
		}
	}

	async function startServerSession() {
		if (!startPromise) {
			if (currentOptions === undefined) {
				throw new Error(
					"Test harness options have not been configured. Pass options to createTestHarness() or call harness.update(options) before harness.listen()."
				);
			}

			workerdLogs = [];
			debugLogs = [];
			initialOptions = currentOptions;
			startPromise = createSession(initialOptions)
				.then((session) => {
					serverSession = session;
					return session;
				})
				.finally(() => {
					startPromise = undefined;
				});
		}

		return await startPromise;
	}

	async function getRuntimeMiniflare(session: ServerSession) {
		const miniflare = session.miniflare;
		assert(miniflare, "Worker runtime is not available.");
		return miniflare;
	}

	function getResolvedWorker(session: ServerSession, workerName: string) {
		const worker = session.workers.find(
			(w) => w.options.config.name === workerName
		);

		assert(
			worker,
			`Worker ${JSON.stringify(workerName)} config is not available.`
		);

		return worker;
	}

	function getInputUrl(input: RequestInfo) {
		if (typeof input === "string") {
			return input;
		}

		if (input instanceof URL) {
			return input.href;
		}

		return input.url;
	}

	async function dispatchFetch(
		miniflare: Miniflare,
		input: RequestInfo,
		init?: RequestInit,
		worker?: string,
		event = "fetch"
	) {
		let resolvedInput = input;

		if (typeof input === "string" && !URL.canParse(input)) {
			const baseUrl = new URL(await miniflare.ready);

			if (
				baseUrl.hostname === "0.0.0.0" ||
				baseUrl.hostname === "::" ||
				baseUrl.hostname === "[::]" ||
				baseUrl.hostname === "*"
			) {
				baseUrl.hostname = "localhost";
			}

			resolvedInput = new URL(input, baseUrl);
		}

		const request = new Request(resolvedInput, init);
		const headers = new Headers(request.headers);
		const context = `${event} - ${request.method} ${getInputUrl(input)}`;

		if (worker) {
			headers.set("MF-Route-Override", worker);
		}

		try {
			debugLog(`${context} - started`, worker);
			const response = await miniflare.dispatchFetch(request, { headers });
			debugLog(`${context} - ${response.status}`, worker);
			return response;
		} catch (error) {
			debugLog(`${context} - failed`, worker);
			throw error;
		}
	}

	return {
		async listen() {
			const session = serverSession ?? (await startServerSession());
			const miniflare = await getRuntimeMiniflare(session);

			return {
				url: await miniflare.ready,
			};
		},
		async fetch(input, init) {
			const session = await resolveSession();
			const miniflare = await getRuntimeMiniflare(session);

			return dispatchFetch(miniflare, input, init);
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- An untyped handle has any binding and export
		getWorker<ConfigModule extends WorkerConfigModule = any>(
			name?: string
		): WorkerHandle<WorkerEnv<ConfigModule>, WorkerMainModule<ConfigModule>> {
			return {
				async introspectWorkflow(exportName) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);

					return miniflare.unsafeIntrospectWorkflow(
						resolveWorkerName(session, name),
						exportName
					);
				},
				async introspectWorkflowInstance(exportName, instanceId) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);

					return miniflare.unsafeIntrospectWorkflowInstance(
						resolveWorkerName(session, name),
						exportName,
						instanceId
					);
				},
				async fetch(input, init) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					return dispatchFetch(miniflare, input, init, workerName);
				},
				async email(emailOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const searchParams = new URLSearchParams({
						format: "json",
						from: emailOptions.from,
						to: emailOptions.to,
					});
					const requestInit: RequestInit & { duplex?: "half" } = {
						method: "POST",
						body: emailOptions.raw,
					};

					if (typeof emailOptions.raw !== "string") {
						requestInit.duplex = "half";
					}

					const response = await dispatchFetch(
						miniflare,
						`${CorePaths.EMAIL}?${searchParams.toString()}`,
						requestInit,
						workerName,
						"email"
					);

					if (response.status >= 400 && response.status < 500) {
						throw new Error(
							`Failed to dispatch email event: ${await response.text()}`
						);
					}

					const result = await response.json();

					return result as FetcherEmailResult;
				},
				async scheduled(scheduledOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const searchParams = new URLSearchParams({
						format: "json",
					});

					if (scheduledOptions?.cron !== undefined) {
						searchParams.set("cron", scheduledOptions.cron);
					}

					if (scheduledOptions?.scheduledTime !== undefined) {
						searchParams.set(
							"time",
							String(scheduledOptions.scheduledTime.getTime())
						);
					}

					const response = await dispatchFetch(
						miniflare,
						`/cdn-cgi/local/scheduled?${searchParams.toString()}`,
						undefined,
						workerName,
						"scheduled"
					);
					const result = await response.json();

					return result as FetcherScheduledResult;
				},
				async listDurableObjectIds(exportName) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					assertDurableObjectExport(session, workerName, exportName);

					debugLog(`durable object ids - ${exportName} - started`, workerName);

					try {
						const ids = await miniflare.listDurableObjectIds(
							exportName,
							workerName
						);
						debugLog(
							`durable object ids - ${exportName} - completed (${ids.length} found)`,
							workerName
						);
						return ids;
					} catch (error) {
						debugLog(`durable object ids - ${exportName} - failed`, workerName);
						throw error;
					}
				},
				async applyD1Migrations(bindingName, migrationsOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const { projectDir } = getResolvedWorker(session, workerName);

					debugLog(`d1 migrations - ${bindingName} - started`, workerName);

					try {
						// Build Output has no migrations config, so these are options, as in
						// `cf d1 migrations apply --dir --pattern --table`
						const migrations = await readD1Migrations({
							projectPath: projectDir,
							migrationsDir: migrationsOptions?.dir,
							migrationsPattern: migrationsOptions?.pattern,
						});
						await applyD1Migrations(
							await miniflare.getD1Database(bindingName, workerName),
							migrations,
							migrationsOptions?.table
						);
						debugLog(
							`d1 migrations - ${bindingName} - completed (${migrations.length} found)`,
							workerName
						);
					} catch (error) {
						debugLog(`d1 migrations - ${bindingName} - failed`, workerName);
						throw error;
					}
				},
				async evictDurableObject(exportName, evictionOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					assertDurableObjectExport(session, workerName, exportName);

					await miniflare.unsafeEvictDurableObject(
						workerName,
						exportName,
						evictionOptions
					);
				},
				async getDurableObjectStorage(exportName, storageOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					assertDurableObjectExport(session, workerName, exportName);

					return miniflare.unsafeGetDurableObjectStorage(
						workerName,
						exportName,
						storageOptions
					);
				},
				async getEnv<WorkerEnvType>() {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					return miniflare.getBindings<WorkerEnvType>(workerName);
				},
				async getExport<Export>() {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const entrypoint = await miniflare.getWorker(workerName);
					/** Miniflare returns the same runtime stub with a different Workers type entry. */
					return entrypoint as unknown as WorkerExport<Export>;
				},
			};
		},
		getLogs() {
			return structuredClone(workerdLogs);
		},
		clearLogs() {
			workerdLogs = [];
		},
		debug() {
			let message = "-------------- No debug log --------------";

			if (debugLogs.length > 0) {
				const lines = debugLogs.map((log) => {
					const tags = [log.source, log.worker]
						.filter((tag) => tag !== undefined)
						.map((tag) => `[${tag}]`)
						.join(" ");

					const level = log.level === undefined ? "" : `${log.level}: `;

					return `${formatLocalTimestamp(log.timestamp)} ${tags} ${level}${log.message}`;
				});

				message = ["--------------- debug logs ---------------", ...lines].join(
					"\n"
				);
			}

			// oxlint-disable-next-line no-console -- Use console.log() directly as the logger is disabled
			console.log(message);
		},
		async update(updateInput) {
			let nextOptions: TestHarnessOptions;

			if (typeof updateInput === "function") {
				assert(
					currentOptions,
					"Cannot update test harness options with a function before options have been configured. Pass options to createTestHarness() or call harness.update(options) first."
				);
				nextOptions = updateInput(currentOptions);
			} else {
				nextOptions = updateInput;
			}

			// If listen() is still starting, wait until serverSession is available so the update is applied to the running Workers.
			if (startPromise) {
				await startPromise;
			}

			if (serverSession) {
				debugLog("update - started");

				try {
					await updateConfig(serverSession, nextOptions);
					debugLog("update - completed");
				} catch (error) {
					debugLog("update - failed");
					await teardownSession(serverSession);
					throw error;
				}
			}

			currentOptions = nextOptions;
		},
		async reset() {
			const session = await resolveSession();

			assert(
				initialOptions,
				"Test harness has not been started. Start it with harness.listen() before calling this method."
			);

			await teardownSession(session);
			currentOptions = initialOptions;

			await startServerSession();
		},
		async close() {
			if (startPromise) {
				// Wait for it to start before tearing down
				// ignoring any errors since we're closing the server anyway
				await startPromise.catch(() => undefined);
			}
			if (serverSession) {
				await teardownSession(serverSession);
			}
		},
	};
}
