import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertConfigToBindings } from "@cloudflare/deploy-helpers";
import {
	normalizeAndValidateConfig,
	UserError,
} from "@cloudflare/workers-utils";
import { Headers, Request } from "miniflare";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { requireApiToken, requireAuth } from "../user";
import { DevEnv } from "./startDevWorker/DevEnv";
import { MultiworkerRuntimeController } from "./startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./startDevWorker/NoOpProxyController";
import type { CfAccount } from "../dev/create-worker-preview";
import type { ErrorEvent } from "./startDevWorker/events";
import type { WranglerStartDevWorkerInput } from "./startDevWorker/types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type { Config, RawConfig } from "@cloudflare/workers-utils";
import type {
	DispatchFetch,
	Json,
	Miniflare,
	RequestInfo,
	WorkerdStructuredLog,
} from "miniflare";

export type TestHarnessOptions = {
	/**
	 * Base directory used to resolve relative worker config paths.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | undefined;
	/**
	 * Workers to run in this server. The first worker is the primary worker.
	 */
	workers: WorkerInput[];
};

export type WorkerHandle = {
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
	 *     { configPath: "./wrangler.dashboard.jsonc" }, // No route pattern
	 *     { configPath: "./wrangler.api.jsonc" }, // Route pattern: "example.com/api/*"
	 *     { configPath: "./wrangler.admin.jsonc" }, // Route pattern: "admin.example.com/*"
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
	 */
	getWorker(name?: string): WorkerHandle;
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

type InlineConfig = Omit<RawConfig, "env">;

type WorkerInput =
	| {
			/**
			 * Path to a Wrangler config file for this Worker.
			 * Relative paths resolve from server `root`.
			 */
			configPath: string | URL;
			/**
			 * Wrangler environment to load from the config file.
			 */
			env?: string;
			/**
			 * Test-only vars that override vars from the Wrangler config.
			 */
			vars?: Record<string, Json>;
			/**
			 * Test-only secrets that override values loaded from `.dev.vars` and `.env` files.
			 */
			secrets?: Record<string, string>;
	  }
	| {
			/**
			 * Inline Wrangler config for this Worker.
			 */
			config: InlineConfig;
	  };

type ServerSession = {
	primaryDevEnv: DevEnv;
	devEnvs: DevEnv[];
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
 * The server can run one or more Workers from Wrangler config files, including
 * generated configs from Vite, or from inline configuration objects.
 *
 * @example
 * ```ts
 * const server = createTestHarness({
 *   workers: [{ configPath: "./wrangler.jsonc" }],
 * });
 * await server.listen();
 * const response = await server.fetch("/api/users");
 * await server.close();
 * ```
 */
export function createTestHarness(options?: TestHarnessOptions): TestHarness {
	let initialOptions = options;
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

	function resolvePath(basePath: string, maybePath: string | URL): string {
		if (maybePath instanceof URL) {
			return fileURLToPath(maybePath);
		}

		return path.isAbsolute(maybePath)
			? maybePath
			: path.resolve(basePath, maybePath);
	}

	function normalizeInlineWorkerConfig(
		config: InlineConfig,
		root: string
	): Config {
		const configPath = path.join(root, "wrangler.jsonc");
		const { config: normalizedConfig, diagnostics } =
			normalizeAndValidateConfig(config, configPath, configPath, {});

		if (diagnostics.hasWarnings()) {
			debugLog(diagnostics.renderWarnings(), normalizedConfig.name);
		}

		if (diagnostics.hasErrors()) {
			throw new UserError(diagnostics.renderErrors(), {
				telemetryMessage: "create server inline config validation failed",
			});
		}

		return normalizedConfig;
	}

	function resolveWorkerInputs(
		serverOptions: TestHarnessOptions
	): WranglerStartDevWorkerInput[] {
		if (serverOptions.workers.length === 0) {
			throw new Error("Test harness requires at least one worker.");
		}

		const root = serverOptions.root ?? process.cwd();

		return serverOptions.workers.map((input, index, list) => {
			const isPrimaryWorker = index === 0;
			const isMultiworker = list.length > 1;
			const bindings = convertConfigToBindings(
				{ vars: "vars" in input ? input.vars : undefined },
				{ usePreviewIds: true }
			);
			const secrets = "secrets" in input ? input.secrets : undefined;
			for (const [key, value] of Object.entries(secrets ?? {})) {
				bindings[key] = { type: "secret_text", value };
			}

			return {
				config:
					"config" in input
						? normalizeInlineWorkerConfig(input.config, root)
						: resolvePath(root, input.configPath),
				env: "env" in input ? input.env : undefined,
				bindings,
				dev: {
					auth: serverAuthHook,
					server: { hostname: "127.0.0.1", port: 0 },
					logLevel: "none",
					watch: false,
					persist: false,
					inspector: false,
					registry: undefined,
					structuredLogsHandler: (log: WorkerdStructuredLog) =>
						captureStructuredLog(log),
					outboundService: (request) => {
						/**
						 * Miniflare passes its own undici-based Request here. Pass the URL as
						 * RequestInfo and the request as RequestInit so method, headers, body,
						 * and duplex are preserved by global fetch.
						 */
						return globalThis.fetch(request.url, request);
					},
					multiworkerPrimary: isMultiworker ? isPrimaryWorker : undefined,
					inferOriginFromRoutes: false,
				},
				build: {
					nodejsCompatMode: (config) => {
						return validateNodeCompatMode(
							config.compatibility_date,
							config.compatibility_flags ?? [],
							{ noBundle: config.no_bundle }
						);
					},
				},
			};
		});
	}

	async function createSession(
		serverOptions: TestHarnessOptions
	): Promise<ServerSession> {
		const inputs = resolveWorkerInputs(serverOptions);
		const [, ...auxiliaryWorkers] = inputs;
		const isMultiworker = auxiliaryWorkers.length > 0;
		const primaryDevEnv = isMultiworker
			? new DevEnv({
					runtimeFactories: [
						(devEnv) => new MultiworkerRuntimeController(devEnv, inputs.length),
					],
				})
			: new DevEnv();
		const auxiliaryDevEnvs = auxiliaryWorkers.map(
			() =>
				new DevEnv({
					runtimeFactories: [() => primaryDevEnv.runtimes[0]],
					proxyFactory: (devEnv) => new NoOpProxyController(devEnv),
				})
		);
		const session: ServerSession = {
			primaryDevEnv,
			devEnvs: [primaryDevEnv, ...auxiliaryDevEnvs],
		};
		try {
			debugLog("startup - started");
			await updateConfig(session, inputs);
			await waitForProxyReady(session);
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
		inputs: WranglerStartDevWorkerInput[]
	) {
		for (const [index, workerInput] of inputs.entries()) {
			const devEnv = session.devEnvs[index];
			await devEnv.config.set(workerInput, true);
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
			const primaryWorkerName = session.primaryDevEnv.config.latestConfig?.name;
			assert(
				primaryWorkerName,
				"Primary Worker name is not available. Add a Worker `name` or call server.getWorker(name)."
			);
			return primaryWorkerName;
		}

		const workerExists = session.devEnvs.some((devEnv) => {
			return devEnv.config.latestConfig?.name === workerName;
		});

		if (!workerExists) {
			throw new TypeError(
				`Worker ${JSON.stringify(workerName)} does not exist in this server.`
			);
		}

		return workerName;
	}

	async function serverAuthHook(
		config: Pick<Config, "account_id">
	): Promise<CfAccount> {
		return {
			accountId: await requireAuth(config),
			apiToken: requireApiToken(),
		};
	}

	async function teardownSession(session: ServerSession) {
		try {
			debugLog("teardown - started");
			await Promise.all(session.devEnvs.map((devEnv) => devEnv.teardown()));
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
					"Test harness options have not been configured. Pass options to createTestHarness() or call server.update(options) before server.listen()."
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

	async function waitForProxyReady(session: ServerSession) {
		return new Promise<
			Awaited<typeof session.primaryDevEnv.proxy.ready.promise>
		>((resolve, reject) => {
			const cleanup = () => {
				for (const devEnv of session.devEnvs) {
					devEnv.off("error", onError);
					devEnv.off("buildFailed", onBuildFailed);
				}
			};
			const onError = (error: unknown) => {
				cleanup();
				reject(resolveErrorCause(error));
			};
			const onBuildFailed = (error: ErrorEvent) => {
				cleanup();
				reject(resolveErrorCause(error));
			};

			for (const devEnv of session.devEnvs) {
				devEnv.once("error", onError);
				devEnv.once("buildFailed", onBuildFailed);
			}

			void session.primaryDevEnv.proxy.ready.promise.then(
				(ready) => {
					cleanup();
					resolve(ready);
				},
				(error: unknown) => {
					cleanup();
					reject(error);
				}
			);
		});
	}

	async function waitForReloadComplete(session: ServerSession) {
		return new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				for (const devEnv of session.devEnvs) {
					devEnv.off("error", onError);
					devEnv.off("buildFailed", onBuildFailed);
				}

				session.primaryDevEnv.off("reloadComplete", onReloadComplete);
			};
			const onError = (error: unknown) => {
				cleanup();
				reject(resolveErrorCause(error));
			};
			const onBuildFailed = (error: ErrorEvent) => {
				cleanup();
				reject(resolveErrorCause(error));
			};
			const onReloadComplete = () => {
				cleanup();
				resolve();
			};

			for (const devEnv of session.devEnvs) {
				devEnv.once("error", onError);
				devEnv.once("buildFailed", onBuildFailed);
			}

			session.primaryDevEnv.once("reloadComplete", onReloadComplete);
		});
	}

	function resolveErrorCause(error: unknown) {
		if (isErrorEvent(error)) {
			return error.cause;
		}

		return error;
	}

	function isErrorEvent(error: unknown): error is ErrorEvent {
		return (
			typeof error === "object" &&
			error !== null &&
			"type" in error &&
			error.type === "error" &&
			"cause" in error
		);
	}

	async function getRuntimeMiniflare(session: ServerSession) {
		await session.primaryDevEnv.proxy.runtimeMessageMutex.drained();
		const miniflare = session.primaryDevEnv.runtimes[0].mf;
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
		let resolvedInput = input;

		if (typeof input === "string" && !URL.canParse(input)) {
			const session = await resolveSession();
			const { url } = await waitForProxyReady(session);
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
			const ready = await waitForProxyReady(session);

			return {
				url: ready.url,
			};
		},
		async fetch(input, init) {
			const session = await resolveSession();
			const miniflare = session.primaryDevEnv.proxy.proxyWorker;
			assert(
				miniflare,
				"The proxy worker is not available yet. Did you call server.listen()?"
			);

			return dispatchFetch(miniflare, input, init);
		},
		getWorker(name?: string) {
			return {
				async fetch(input, init) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					return dispatchFetch(miniflare, input, init, workerName);
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
						`/cdn-cgi/handler/scheduled?${searchParams.toString()}`,
						undefined,
						workerName,
						"scheduled"
					);
					const result = await response.json();

					return result as FetcherScheduledResult;
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
					"Cannot update test harness options with a function before options have been configured. Pass options to createTestHarness() or call server.update(options) first."
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
				const nextInputs = resolveWorkerInputs(nextOptions);

				if (nextInputs.length !== serverSession.devEnvs.length) {
					throw new Error(
						`Updating the number of workers running in the server is not supported.`
					);
				}

				try {
					await Promise.all([
						waitForReloadComplete(serverSession),
						updateConfig(serverSession, nextInputs),
					]);
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
				"Server has not been started. Start it with server.listen() before calling this method."
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
