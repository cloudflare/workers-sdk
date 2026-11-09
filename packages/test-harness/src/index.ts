import assert from "node:assert";
import { UserError } from "@cloudflare/workers-utils";
import { CorePaths, Headers, Miniflare, Request } from "miniflare";
import { BUN_UNSUPPORTED_MESSAGE, isBun } from "./is-bun";
import { disposeRemoteProxySessions, resolveWorkerInputs } from "./runtime";
import type { ResolvedWorker } from "./runtime";
import type { ExportedHandler, Rpc, Service } from "@cloudflare/workers-types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type {
	DispatchFetch,
	EmailHandlerResult,
	Json,
	MiniflareOptions,
	RequestInfo,
	WorkerdStructuredLog,
} from "miniflare";

export type TestHarnessOptions = {
	/**
	 * Base directory that relative `buildOutput` paths resolve from.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | URL;
	/**
	 * Workers to run in this harness. The first Worker is the primary Worker.
	 */
	workers: WorkerInput[];
};

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
	 * the server is closed.
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
	 *     { buildOutput: "./dashboard" }, // No route pattern
	 *     { buildOutput: "./api" }, // Route pattern: "example.com/api/*"
	 *     { buildOutput: "./admin" }, // Route pattern: "admin.example.com/*"
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
	 *
	 * Under Bun, this method and `server.getWorker()`'s `fetch()`, `email()` and
	 * `scheduled()` cannot reach the Worker, because Bun's `fetch()` ignores the
	 * undici `dispatcher` that Miniflare routes requests through. The methods
	 * throw a `UserError`. `server.getWorker().getEnv()` and `getExport()` keep
	 * working under Bun.
	 */
	fetch: DispatchFetch;
	/**
	 * Returns a handle for dispatching events directly to a Worker.
	 * When no name is provided, this returns the primary Worker, which is the first
	 * Worker in the server's `workers` options.
	 */
	getWorker<
		Env = AnyEnv,
		Module extends WorkerModule = { default: AnyExportedHandler },
	>(
		name?: string
	): WorkerHandle<Env, Module>;
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
	 * Stops the server and releases all runtime resources.
	 */
	close(): Promise<void>;
};

export type WorkerInput = {
	/**
	 * The project directory containing the build's `.cloudflare/output`.
	 * Relative paths resolve from the harness's `root`.
	 */
	buildOutput: string | URL;
	/**
	 * The name of the Worker to run from that build. Defaults to the build's
	 * default Worker.
	 */
	name?: string;
	/**
	 * Test-only vars that override vars from the Worker's config.
	 */
	vars?: Record<string, Json>;
	/**
	 * Test-only secrets that override values loaded from `.dev.vars` and `.env` files.
	 */
	secrets?: Record<string, string>;
	/**
	 * Test-only service binding overrides. Keys are binding names in this
	 * Worker's environment, and values are Worker names in this test harness.
	 */
	bindingOverrides?: Record<string, string>;
};

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
 * Creates a local test server for running Workers.
 *
 * The server can run one or more Workers from their projects' Build Output.
 *
 * @example
 * ```ts
 * const server = createTestHarness({
 *   workers: [{ buildOutput: "./" }],
 * });
 * await server.listen();
 * const response = await server.fetch("/api/users");
 * await server.close();
 * ```
 */
export function createTestHarness(options: TestHarnessOptions): TestHarness {
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
		return {
			host: "127.0.0.1",
			port: 0,
			enableDevRegistry: false,
			unsafeTriggerHandlers: true,
			handleStructuredLogs: (log: WorkerdStructuredLog) =>
				captureStructuredLog(log),
			workers: workers.map((worker) => worker.options),
		};
	}

	async function createSession(
		serverOptions: TestHarnessOptions
	): Promise<ServerSession> {
		const session: ServerSession = { workers: [] };
		try {
			debugLog("startup - started");
			session.workers = await resolveWorkerInputs(serverOptions);
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

	async function resolveSession() {
		if (startPromise) {
			return await startPromise;
		}

		assert(
			serverSession,
			"Server has not been started. Start it with server.listen() before calling this method."
		);

		return serverSession;
	}

	function resolveWorkerName(
		session: ServerSession,
		workerName: string | undefined
	) {
		if (workerName === undefined) {
			const primaryWorkerName = session.workers[0]?.options.config.name;
			assert(primaryWorkerName, "Primary Worker name is not available.");
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
			workerdLogs = [];
			debugLogs = [];
			startPromise = createSession(options)
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
		// Miniflare's `dispatchFetch()` routes every request, `getWorker()` ones
		// included, through an undici dispatcher that Bun's `fetch()` ignores, so
		// a request can leave for the network. Refuse before sending anything.
		if (isBun()) {
			throw new UserError(
				`${BUN_UNSUPPORTED_MESSAGE} \`server.getWorker().getEnv()\` and \`getExport()\` still work under Bun.`,
				{ telemetryMessage: "test harness dispatch under bun" }
			);
		}

		let resolvedInput = input;

		if (typeof input === "string" && !URL.canParse(input)) {
			const url = await miniflare.ready;
			const baseUrl = new URL(url);

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
		getWorker<
			Env = AnyEnv,
			Module extends WorkerModule = { default: AnyExportedHandler },
		>(name?: string): WorkerHandle<Env, Module> {
			return {
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
				async getEnv() {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					return miniflare.getBindings<Env>(workerName);
				},
				async getExport() {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const entrypoint = await miniflare.getWorker(workerName);
					/** Miniflare returns the same runtime stub with a different Workers type entry. */
					return entrypoint as unknown as Service<Module["default"]>;
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
