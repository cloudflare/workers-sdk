import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	normalizeAndValidateConfig,
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
import type {
	LogLevel,
	ServiceFetch,
	StartDevWorkerInput,
} from "./startDevWorker/types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type { Config, RawConfig, Trigger } from "@cloudflare/workers-utils";
import type { DispatchFetch, Json, RequestInfo } from "miniflare";

export type InlineConfig = Omit<RawConfig, "env">;

export type ConfigOverrides = {
	vars?: Record<string, Json>;
	secrets?: Record<string, string>;
};

export type WorkerInput =
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

export type InspectorOptions = Exclude<
	NonNullable<StartDevWorkerInput["dev"]>["inspector"],
	undefined
>;

export type ServerOptions = {
	root?: string | undefined;
	workers: WorkerInput[];
	server?: DevServerOptions | undefined;
	inspector?: InspectorOptions | undefined;
	persist?: boolean | string | undefined;
	watch?: boolean | undefined;
	logLevel?: LogLevel | undefined;
	accountId?: string | undefined;
	allowRemoteBindings?: boolean | undefined;
	outboundService?: ServiceFetch | undefined;
};

export type Worker = {
	fetch: DispatchFetch;
	scheduled(options: FetcherScheduledOptions): Promise<FetcherScheduledResult>;
};

export type WorkerServer = {
	listen(): Promise<{
		url: URL;
		inspectorUrl: URL | undefined;
	}>;
	fetch: DispatchFetch;
	getWorker(name?: string): Worker;
	update(
		options: ServerOptions | ((currentOptions: ServerOptions) => ServerOptions)
	): Promise<void>;
	close(): Promise<void>;
};

type ServerSession = {
	primaryDevEnv: DevEnv;
	devEnvs: DevEnv[];
};

type ServerAuthHook = NonNullable<
	NonNullable<StartDevWorkerInput["dev"]>["auth"]
>;

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
	const { config: normalizedConfig, diagnostics } = normalizeAndValidateConfig(
		config,
		configPath,
		configPath,
		{}
	);

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

type ConfigRoute = NonNullable<Config["route"]> | NonNullable<Config["routes"]>[number];

function routeToTrigger(route: ConfigRoute): Extract<Trigger, { type: "route" }> {
	return typeof route === "string"
		? { type: "route", pattern: route }
		: { type: "route", ...route };
}

function getInlineConfigTriggers(config: Config): Trigger[] {
	const routes = [
		...(config.route ? [config.route] : []),
		...(config.routes ?? []),
	].map(routeToTrigger);
	const crons =
		config.triggers.crons?.map<Extract<Trigger, { type: "cron" }>>((cron) => ({
			type: "cron",
			cron,
		})) ?? [];

	return [...routes, ...crons];
}

async function resolveFetchInput(
	input: RequestInfo,
	session: ServerSession
): Promise<RequestInfo> {
	if (typeof input !== "string") {
		return input;
	}

	const { url } = await session.primaryDevEnv.proxy.ready.promise;
	const baseUrl = new URL(url);

	if (
		baseUrl.hostname === "0.0.0.0" ||
		baseUrl.hostname === "::" ||
		baseUrl.hostname === "[::]" ||
		baseUrl.hostname === "*"
	) {
		baseUrl.hostname = "localhost";
	}

	return new URL(input, baseUrl);
}

function resolveWorkerInputs(
	options: ServerOptions,
	auth: ServerAuthHook
): StartDevWorkerInput[] {
	if (options.workers.length === 0) {
		throw new Error("Worker server requires at least one worker.");
	}

	const cwd = process.cwd();

	return options.workers.map((input, index, list) => {
		const isPrimaryWorker = index === 0;
		const isMultiworker = list.length > 1;
		const root = input.root ?? options.root ?? cwd;
		const inlineConfig =
			"config" in input
				? normalizeInlineWorkerConfig(input.config, root)
				: undefined;
		const overrides = "configPath" in input ? input.overrides : undefined;
		const bindings = convertConfigToBindings(
			inlineConfig ?? { vars: overrides?.vars },
			{ usePreviewIds: true }
		);

		for (const [key, value] of Object.entries(overrides?.secrets ?? {})) {
			bindings[key] = { type: "secret_text", value };
		}

		return {
			// Uses an empty string to avoid dev env from auto discovering a config file and merging it with the inline config
			config: "configPath" in input ? resolvePath(root, input.configPath) : "",
			env: "configPath" in input ? input.env : undefined,
			name: inlineConfig?.name,
			entrypoint: inlineConfig?.main,
			compatibilityDate: inlineConfig?.compatibility_date,
			compatibilityFlags: inlineConfig?.compatibility_flags,
			complianceRegion: inlineConfig?.compliance_region,
			pythonModules: inlineConfig?.python_modules,
			bindings,
			migrations: inlineConfig?.migrations,
			containers: inlineConfig?.containers,
			triggers: inlineConfig ? getInlineConfigTriggers(inlineConfig) : undefined,
			tailConsumers: inlineConfig?.tail_consumers,
			streamingTailConsumers: inlineConfig?.streaming_tail_consumers,
			assets: inlineConfig?.assets?.directory,
			dev: {
				auth,
				remote: options.allowRemoteBindings ? undefined : false,
				server: options.server ?? { hostname: "127.0.0.1", port: 0 },
				logLevel: options.logLevel ?? "error",
				watch: options.watch ?? false,
				persist:
					options.persist === true ? undefined : (options.persist ?? false),
				inspector: options.inspector ?? false,
				outboundService:
					options.outboundService ??
					((request) => {
						return globalThis.fetch(request.url, request);
					}),
				multiworkerPrimary: isMultiworker ? isPrimaryWorker : undefined,
				inferOriginFromRoutes: false,
			},
			build: {
				nodejsCompatMode: (config) => {
					const hookConfig = inlineConfig ?? config;
					return validateNodeCompatMode(
						hookConfig.compatibility_date,
						hookConfig.compatibility_flags ?? [],
						{ noBundle: hookConfig.no_bundle }
					);
				},
			},
			legacy: {
				site: (config) => {
					const legacyAssetPaths = getSiteAssetPaths(inlineConfig ?? config);

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
	options: ServerOptions,
	auth: ServerAuthHook
): Promise<ServerSession> {
	const inputs = resolveWorkerInputs(options, auth);
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

	await updateConfig(session, inputs);

	return session;
}

async function updateConfig(
	session: ServerSession,
	inputs: StartDevWorkerInput[]
) {
	try {
		for (const [index, workerInput] of inputs.entries()) {
			const devEnv = session.devEnvs[index];
			await devEnv.config.set(workerInput, true);
		}
	} catch (error) {
		await Promise.allSettled(
			session.devEnvs.map((devEnv) => devEnv.teardown())
		);
		throw error;
	}
}

/**
 * Creates a worker server with a small, migration-focused API surface.
 *
 * This intentionally reuses DevEnv/controller internals with minimal behavior changes.
 */
export function createServer(options: ServerOptions): WorkerServer {
	let currentOptions = options;
	let desiredAccountId = options.accountId;
	let serverSession: ServerSession | undefined;
	let startPromise: Promise<void> | undefined;

	const resolveSession = () => {
		assert(
			serverSession,
			"Worker server has not been started. Call server.listen()."
		);
		return serverSession;
	};

	const serverAuthHook: ServerAuthHook = async (config) => {
		desiredAccountId ??= await requireAuth(config);

		return {
			accountId: desiredAccountId,
			apiToken: requireApiToken(),
		};
	};

	const teardownSession = async (session: ServerSession) => {
		await Promise.all(session.devEnvs.map((devEnv) => devEnv.teardown()));
	};

	const waitForPrimaryReady = async (session: ServerSession) => {
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
	};

	const waitForReloadComplete = (session: ServerSession) => {
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
	};

	const startServerSession = async () => {
		const session = await createSession(currentOptions, serverAuthHook);

		try {
			await waitForPrimaryReady(session);
			serverSession = session;
		} catch (error) {
			await teardownSession(session);
			throw error;
		}
	};

	const workerServer: WorkerServer = {
		async listen() {
			if (!serverSession) {
				if (!startPromise) {
					startPromise = startServerSession().finally(() => {
						startPromise = undefined;
					});
				}

				await startPromise;
			}

			assert(serverSession, "Worker server has no active session.");
			const ready = await serverSession.primaryDevEnv.proxy.ready.promise;

			return {
				url: ready.url,
				inspectorUrl: ready.inspectorUrl,
			};
		},
		async fetch(input, init) {
			const session = resolveSession();
			const miniflare = session.primaryDevEnv.proxy.proxyWorker;
			assert(
				miniflare,
				"The proxy worker is not available yet. Did you call server.listen()?"
			);

			return miniflare.dispatchFetch(
				await resolveFetchInput(input, session),
				init
			);
		},
		getWorker(name?: string) {
			const getRuntimeMiniflare = async (session: ServerSession) => {
				await session.primaryDevEnv.proxy.runtimeMessageMutex.drained();
				const miniflare = session.primaryDevEnv.runtimes[0].mf;
				assert(miniflare, "Worker runtime is not available.");
				return miniflare;
			};

			return {
				async fetch(input, init) {
					const session = resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const request = new Request(
						await resolveFetchInput(input, session),
						init
					);
					const headers = new Headers(request.headers);

					headers.set("MF-Original-URL", request.url);
					headers.set("MF-Disable-Pretty-Error", "true");

					if (name !== undefined) {
						headers.set("MF-Route-Override", name);
					}

					return miniflare.dispatchFetch(request, {
						headers,
					});
				},
				async scheduled(scheduledOptions) {
					const session = resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const url = new URL("http://localhost/cdn-cgi/handler/scheduled");
					if (scheduledOptions?.cron !== undefined) {
						url.searchParams.set("cron", scheduledOptions.cron);
					}
					if (scheduledOptions?.scheduledTime !== undefined) {
						url.searchParams.set(
							"time",
							String(scheduledOptions.scheduledTime.getTime())
						);
					}
					const headers = new Headers();
					headers.set("MF-Original-URL", url.toString());
					headers.set("MF-Disable-Pretty-Error", "true");

					if (name !== undefined) {
						headers.set("MF-Route-Override", name);
					}
					const response = await miniflare.dispatchFetch(url, {
						headers,
					});
					const outcomeText = await response.text();
					const outcome: FetcherScheduledResult["outcome"] =
						outcomeText === "ok" || outcomeText === "exception"
							? outcomeText
							: "exception";

					return {
						outcome,
						// FIXME: scheduled handler should include noRetry info in the response
						noRetry: false,
					};
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
				const nextInputs = resolveWorkerInputs(currentOptions, serverAuthHook);

				if (nextInputs.length !== serverSession.devEnvs.length) {
					throw new Error(
						`Updating the number of workers running in the server is not supported.`
					);
				}

				await Promise.all([
					waitForReloadComplete(serverSession),
					updateConfig(serverSession, nextInputs),
				]);
			}
		},
		async close() {
			if (startPromise) {
				await startPromise.catch(() => undefined);
				startPromise = undefined;
			}
			if (serverSession) {
				await teardownSession(serverSession);
				serverSession = undefined;
			}
		},
	};

	return workerServer;
}
