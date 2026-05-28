import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	normalizeAndValidateConfig,
	removeDir,
	UserError,
} from "@cloudflare/workers-utils";
import { Headers, Request } from "miniflare";
import { validateNodeCompatMode } from "../deployment-bundle/node-compat";
import { logger } from "../logger";
import { getSiteAssetPaths } from "../sites";
import { requireApiToken, requireAuth } from "../user";
import { DevEnv } from "./startDevWorker/DevEnv";
import { MultiworkerRuntimeController } from "./startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./startDevWorker/NoOpProxyController";
import { convertConfigToBindings } from "./startDevWorker/utils";
import type { CfAccount } from "../dev/create-worker-preview";
import type {
	LogLevel,
	BindingMode,
	ServiceFetch,
	StartDevWorkerInput,
} from "./startDevWorker/types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type { Config, RawConfig } from "@cloudflare/workers-utils";
import type { DispatchFetch, Json, Miniflare, RequestInfo } from "miniflare";

export type ServerOptions = {
	/**
	 * Base directory used to resolve relative worker config paths and persist paths.
	 * Defaults to `process.cwd()`.
	 */
	root?: string | undefined;
	/**
	 * Workers to run in this server. The first worker is the primary worker.
	 */
	workers: WorkerInput[];
	/**
	 * Host, port, and protocol options for the public server.
	 * Defaults to `{ hostname: "127.0.0.1", port: 0 }`.
	 */
	server?: DevServerOptions | undefined;
	/**
	 * Inspector options for debugging Workers. Set to `false` to disable.
	 * Defaults to `false`.
	 */
	inspector?: InspectorOptions | undefined;
	/**
	 * Controls local storage persistence.
	 * Defaults to `false` for ephemeral storage. Set to a path to persist storage there.
	 */
	persist?: boolean | string | undefined;
	/**
	 * Whether to watch worker source/config files and reload on changes.
	 * Defaults to `false`.
	 */
	watch?: boolean | undefined;
	/**
	 * Minimum Wrangler log level emitted while running the server.
	 * Defaults to `"error"`.
	 */
	logLevel?: LogLevel | undefined;
	/**
	 * Cloudflare account ID used when an operation requires account context.
	 * Defaults to the account selected by Wrangler auth when needed.
	 */
	accountId?: string | undefined;
	/**
	 * Overrides how bindings are resolved for this server.
	 *
	 * - `"local"`: use local bindings and reject bindings without local support
	 * - `"local-first"`: use local bindings when available, remote otherwise
	 * - `"configured"`: use the binding mode configured in each Worker config
	 *
	 * Defaults to `"local-first"`.
	 */
	bindingMode?: BindingMode | undefined;
	/**
	 * Handles outbound `fetch()` calls from Workers.
	 * Defaults to the current process `fetch`.
	 */
	outboundService?: ServiceFetch | undefined;
};

export type WorkerHandle = {
	/**
	 * Dispatches a fetch event directly to this worker.
	 * Relative URL inputs are resolved against the current server URL.
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

export type WorkerServer = {
	/**
	 * Starts the server and returns its current URL.
	 * Calling this more than once returns the same running server session until
	 * the server is closed or reset by an operation such as `clearStorage()`.
	 */
	listen(): Promise<{
		url: URL;
		inspectorUrl: URL | undefined;
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
	 * const server = createServer({
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
	 * Updates the server configuration and reloads the running Workers.
	 *
	 * @example
	 * ```ts
	 * await server.update((options) => ({
	 *   ...options,
	 *   outboundService(request) {
	 *     if (request.url === "http://example.com/api/data") {
	 *       return Response.json([
	 *         { id: 1, name: "Alice" },
	 *         { id: 2, name: "Bob" }
	 *       ]);
	 *     }
	 *
	 *     throw new Error(`Unexpected request to ${request.url}`);
	 *   },
	 * }));
	 * ```
	 */
	update(
		options: ServerOptions | ((currentOptions: ServerOptions) => ServerOptions)
	): Promise<void>;
	/**
	 * Clears local storage and restarts the server session.
	 * The server URL may change after storage is cleared.
	 */
	clearStorage(): Promise<void>;
	/**
	 * Stops the server and releases all runtime resources.
	 */
	close(): Promise<void>;
};

type InlineConfig = Omit<RawConfig, "env">;

type ConfigOverrides = {
	vars?: Record<string, Json>;
	secrets?: Record<string, string>;
};

type WorkerInput =
	| {
			root?: string;
			configPath: string | URL;
			env?: string;
			overrides?: ConfigOverrides;
	  }
	| {
			root?: string;
			config: InlineConfig;
	  };

type DevServerOptions = Exclude<
	NonNullable<StartDevWorkerInput["dev"]>["server"],
	undefined
>;

type InspectorOptions = Exclude<
	NonNullable<StartDevWorkerInput["dev"]>["inspector"],
	undefined
>;

type ServerSession = {
	primaryDevEnv: DevEnv;
	devEnvs: DevEnv[];
};

/**
 * Creates a server that runs Workers locally.
 *
 * The server can run one or more Workers from Wrangler config files, including
 * generated configs from Vite, or from inline configuration objects.
 *
 * @example
 * ```ts
 * const server = createServer({
 *   workers: [{ configPath: "./wrangler.jsonc" }],
 * });
 * await server.listen();
 * const response = await server.fetch("/api/users");
 * await server.close();
 * ```
 */
export function createServer(options: ServerOptions): WorkerServer {
	let currentOptions = options;
	let desiredAccountId = options.accountId;
	let serverSession: ServerSession | undefined;
	let startPromise: Promise<ServerSession> | undefined;

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
			logger.warn(diagnostics.renderWarnings());
		}

		if (diagnostics.hasErrors()) {
			throw new UserError(diagnostics.renderErrors(), {
				telemetryMessage: "create server inline config validation failed",
			});
		}

		return normalizedConfig;
	}

	function resolvePersistOption(
		root: string,
		persist: ServerOptions["persist"]
	): string | false | undefined {
		if (persist === true) {
			return undefined;
		}
		if (typeof persist === "string") {
			return resolvePath(root, persist);
		}
		return persist ?? false;
	}

	function bindingMode(serverOptions: ServerOptions): BindingMode {
		return serverOptions.bindingMode ?? "local-first";
	}

	function resolveWorkerInputs(
		serverOptions: ServerOptions
	): StartDevWorkerInput[] {
		if (serverOptions.workers.length === 0) {
			throw new Error("Worker server requires at least one worker.");
		}

		const cwd = process.cwd();
		const serverRoot = serverOptions.root ?? cwd;

		return serverOptions.workers.map((input, index, list) => {
			const isPrimaryWorker = index === 0;
			const isMultiworker = list.length > 1;
			const root = input.root ?? serverOptions.root ?? cwd;
			const inlineConfig =
				"config" in input
					? normalizeInlineWorkerConfig(input.config, root)
					: undefined;
			const overrides = "configPath" in input ? input.overrides : undefined;
			const bindings = convertConfigToBindings(
				{ vars: overrides?.vars },
				{ usePreviewIds: true }
			);
			for (const [key, value] of Object.entries(overrides?.secrets ?? {})) {
				bindings[key] = { type: "secret_text", value };
			}

			return {
				config:
					"configPath" in input
						? resolvePath(root, input.configPath)
						: inlineConfig,
				env: "configPath" in input ? input.env : undefined,
				bindings,
				dev: {
					auth: serverAuthHook,
					remote: bindingMode(serverOptions) === "local" ? false : undefined,
					bindingMode: bindingMode(serverOptions),
					server: serverOptions.server ?? { hostname: "127.0.0.1", port: 0 },
					logLevel: serverOptions.logLevel ?? "error",
					watch: serverOptions.watch ?? false,
					persist: resolvePersistOption(serverRoot, serverOptions.persist),
					inspector: serverOptions.inspector ?? false,
					registry: undefined,
					outboundService:
						serverOptions.outboundService ??
						((request) => {
							return globalThis.fetch(request.url, request);
						}),
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
				legacy: {
					site: (config) => {
						const legacyAssetPaths = getSiteAssetPaths(config);

						if (!legacyAssetPaths) {
							return undefined;
						}

						return {
							bucket: path.join(
								legacyAssetPaths.baseDirectory,
								legacyAssetPaths.assetDirectory
							),
							include: legacyAssetPaths.includePatterns,
							exclude: legacyAssetPaths.excludePatterns,
						};
					},
				},
			};
		});
	}

	async function createSession(
		serverOptions: ServerOptions
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
			await updateConfig(session, inputs);
			await waitForProxyReady(session);
			return session;
		} catch (error) {
			await teardownSession(session);
			throw error;
		}
	}

	async function updateConfig(
		session: ServerSession,
		inputs: StartDevWorkerInput[]
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
			"Worker server has not been started. Start it with server.listen() before calling this method."
		);

		return serverSession;
	}

	async function serverAuthHook(
		config: Pick<Config, "account_id">
	): Promise<CfAccount> {
		desiredAccountId ??= await requireAuth(config);

		return {
			accountId: desiredAccountId,
			apiToken: requireApiToken(),
		};
	}

	async function teardownSession(session: ServerSession) {
		try {
			await Promise.all(session.devEnvs.map((devEnv) => devEnv.teardown()));
		} finally {
			if (session === serverSession) {
				serverSession = undefined;
			}
		}
	}

	async function startServerSession() {
		if (!startPromise) {
			startPromise = createSession(currentOptions)
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
			const onError = (error: unknown) => {
				session.primaryDevEnv.off("error", onError);
				reject(error);
			};

			session.primaryDevEnv.once("error", onError);
			void session.primaryDevEnv.proxy.ready.promise.then(
				(ready) => {
					session.primaryDevEnv.off("error", onError);
					resolve(ready);
				},
				(error: unknown) => {
					session.primaryDevEnv.off("error", onError);
					reject(error);
				}
			);
		});
	}

	async function waitForReloadComplete(session: ServerSession) {
		return new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				session.primaryDevEnv.off("error", onError);
				session.primaryDevEnv.off("reloadComplete", onReloadComplete);
			};
			const onError = (error: unknown) => {
				cleanup();
				reject(error);
			};
			const onReloadComplete = () => {
				cleanup();
				resolve();
			};

			session.primaryDevEnv.once("error", onError);
			session.primaryDevEnv.once("reloadComplete", onReloadComplete);
		});
	}

	async function getRuntimeMiniflare(session: ServerSession) {
		await session.primaryDevEnv.proxy.runtimeMessageMutex.drained();
		const miniflare = session.primaryDevEnv.runtimes[0].mf;
		assert(miniflare, "Worker runtime is not available.");
		return miniflare;
	}

	async function dispatchFetch(
		miniflare: Miniflare,
		input: RequestInfo,
		init?: RequestInit,
		worker?: string
	) {
		if (typeof input === "string") {
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

			input = new URL(input, baseUrl);
		}

		if (worker === undefined) {
			return miniflare.dispatchFetch(input, init);
		}

		const request = new Request(input, init);
		const headers = new Headers(request.headers);

		headers.set("MF-Route-Override", worker);

		return miniflare.dispatchFetch(request, { headers });
	}

	return {
		async listen() {
			const session = serverSession ?? (await startServerSession());
			const ready = await waitForProxyReady(session);

			return {
				url: ready.url,
				inspectorUrl: ready.inspectorUrl,
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

					return dispatchFetch(miniflare, input, init, name);
				},
				async scheduled(scheduledOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const url = new URL(
						"http://localhost/cdn-cgi/handler/scheduled?format=json"
					);

					if (scheduledOptions?.cron !== undefined) {
						url.searchParams.set("cron", scheduledOptions.cron);
					}

					if (scheduledOptions?.scheduledTime !== undefined) {
						url.searchParams.set(
							"time",
							String(scheduledOptions.scheduledTime.getTime())
						);
					}

					const response = await dispatchFetch(miniflare, url, undefined, name);
					const result = await response.json();

					return result as FetcherScheduledResult;
				},
			};
		},
		async update(updateInput) {
			currentOptions =
				typeof updateInput === "function"
					? updateInput(currentOptions)
					: updateInput;
			desiredAccountId = currentOptions.accountId ?? desiredAccountId;

			if (serverSession) {
				const nextInputs = resolveWorkerInputs(currentOptions);

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
				} catch (error) {
					await teardownSession(serverSession);
					throw error;
				}
			}
		},
		async clearStorage() {
			const session = await resolveSession();

			if (currentOptions.persist === true) {
				throw new Error(
					"clearStorage() cannot clear storage when persist is true. Omit persist or set it to false for ephemeral storage, or set persist to a path to clear that directory."
				);
			}

			await teardownSession(session);

			if (typeof currentOptions.persist === "string") {
				const persistPath = resolvePath(
					currentOptions.root ?? process.cwd(),
					currentOptions.persist
				);

				await removeDir(persistPath);
			}

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
