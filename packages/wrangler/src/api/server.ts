import assert from "node:assert";
import events from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Headers, Request } from "miniflare";
import registerDevHotKeys from "../dev/hotkeys";
import { logger } from "../logger";
import { requireApiToken, requireAuth } from "../user";
import { DevEnv } from "./startDevWorker/DevEnv";
import { MultiworkerRuntimeController } from "./startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./startDevWorker/NoOpProxyController";
import { convertConfigToBindings } from "./startDevWorker/utils";
import type {
	LogLevel,
	ServiceFetch,
	StartDevWorkerInput,
	StartDevWorkerOptions,
} from "./startDevWorker/types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type { Config } from "@cloudflare/workers-utils";
import type { DispatchFetch } from "miniflare";

export type WorkerInput =
	| {
			configPath: string | URL;
			env?: string;
			projectRoot?: string | URL;
	  }
	| {
			deployConfig: true | string | URL;
			projectRoot?: string | URL;
	  }
	| {
			config: Config;
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
	workers: WorkerInput[];
	server?: DevServerOptions;
	inspector?: InspectorOptions;
	watch?: boolean;
	logLevel?: LogLevel;
	accountId?: string;
	outbound?: ServiceFetch | null;
};

export type ServerHotKeysOptions = {
	render?: boolean;
	forceLocal?: boolean;
	experimentalTailLogs: boolean;
	remote: boolean;
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
	waitUntilExit(): Promise<void>;
	fetch: DispatchFetch;
	getWorker(name?: string): Worker;
	registerHotKeys(options: ServerHotKeysOptions): void;
	update(
		options: ServerOptions | ((current: ServerOptions) => ServerOptions)
	): Promise<void>;
	close(): Promise<void>;
};

type ServerSession = {
	primaryDevEnv: DevEnv;
	devEnvs: DevEnv[];
};

type DeployConfig = {
	configPath: string;
	auxiliaryWorkers?: Array<{ configPath: string }>;
};

type ServerAuthHook = NonNullable<
	NonNullable<StartDevWorkerInput["dev"]>["auth"]
>;

function isDeployConfig(value: unknown): value is DeployConfig {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const maybeConfig = value as Record<string, unknown>;
	return typeof maybeConfig.configPath === "string";
}

function resolvePathFrom(basePath: string, maybePath: string): string {
	return path.isAbsolute(maybePath)
		? maybePath
		: path.resolve(basePath, maybePath);
}

function resolvePathInput(basePath: string, maybePath: string | URL): string {
	if (maybePath instanceof URL) {
		return fileURLToPath(maybePath);
	}

	return resolvePathFrom(basePath, maybePath);
}

function resolveProjectRoot(projectRoot: string | URL | undefined): string {
	if (projectRoot === undefined) {
		return process.cwd();
	}

	return resolvePathInput(process.cwd(), projectRoot);
}

function resolveDeployConfigWorkerInputs(
	deployConfigPath: string,
): StartDevWorkerInput[] {
	let rawParsed: unknown;

	try {
		rawParsed = JSON.parse(readFileSync(deployConfigPath, "utf8"));
	} catch (error) {
		throw new Error(`Failed to read deploy config at "${deployConfigPath}".`, {
			cause: error,
		});
	}

	if (!isDeployConfig(rawParsed)) {
		throw new Error(
			`Invalid deploy config at "${deployConfigPath}": missing "configPath".`,
		);
	}

	const configDir = path.dirname(deployConfigPath);
	const workers: StartDevWorkerInput[] = [
		{
			config: resolvePathFrom(configDir, rawParsed.configPath),
		},
	];

	for (const auxiliaryWorker of rawParsed.auxiliaryWorkers ?? []) {
		workers.push({
			config: resolvePathFrom(configDir, auxiliaryWorker.configPath),
		});
	}

	return workers;
}

function inlineConfigToStartDevWorkerInput(config: Config): StartDevWorkerInput {
	const basePath = config.configPath
		? path.dirname(config.configPath)
		: process.cwd();

	return {
		// FIXME: to avoid dev env from auto discovering a config file and merging it with the inline config
		config: '',
		name: config.name,
		entrypoint: config.main
			? resolvePathInput(basePath, config.main)
			: undefined,
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		complianceRegion: config.compliance_region,
		bindings: convertConfigToBindings(config, { usePreviewIds: true }),
		migrations: config.migrations,
		containers: config.containers,
		triggers: config.triggers.crons?.map((cron) => ({
			type: "cron",
			cron,
		})),
		tailConsumers: config.tail_consumers,
		streamingTailConsumers: config.streaming_tail_consumers,
		sendMetrics: config.send_metrics,
		assets: config.assets?.directory,
	};
}

function resolveWorkerInputs(options: ServerOptions, auth: ServerAuthHook): StartDevWorkerInput[] {
	if (options.workers.length === 0) {
		throw new Error("Worker server requires at least one worker.");
	}

	return options.workers.flatMap((input, index, list) => {
		const isPrimaryWorker = index === 0;
		const isMultiworker = list.length > 1;
		const dev: StartDevWorkerInput['dev'] = {
			auth,
			server: options.server ?? { hostname: "127.0.0.1", port: 0 },
			logLevel: options.logLevel ?? "error",
			watch: options.watch ?? false,
			inspector: options.inspector ?? false,
			outboundService: options.outbound ?? ((request) => {
				return globalThis.fetch(request.url, request);
			}),
			multiworkerPrimary: isPrimaryWorker && isMultiworker ? true : undefined,
		};

		if ("config" in input) {
			return [{
				...inlineConfigToStartDevWorkerInput(input.config),
				dev,
			}];
		}

		const projectRoot = resolveProjectRoot(input.projectRoot);

		if ("configPath" in input) {
			return [
				{
					config: resolvePathInput(projectRoot, input.configPath),
					env: input.env,
					dev,
				},
			];
		}

		const deployConfigPath =
			input.deployConfig === true
				? path.join(projectRoot, ".wrangler", "deploy", "config.json")
				: resolvePathInput(projectRoot, input.deployConfig);

		return resolveDeployConfigWorkerInputs(deployConfigPath).map((input, index, resolvedInputs) => {
			const isPrimaryWorker = index === 0;
			const isMultiworker = resolvedInputs.length > 1;

			return {
				...input,
				dev: {
					...dev,
					multiworkerPrimary: isPrimaryWorker && (dev.multiworkerPrimary || isMultiworker) ? true : undefined,
				},
			};
		});
	});
}

async function createSession(
	options: ServerOptions,
	auth: ServerAuthHook,
): Promise<ServerSession> {
	const inputs = resolveWorkerInputs(options, auth);
	const [, ...auxiliaryWorkers] = inputs;
	const isMultiworker = auxiliaryWorkers.length > 0;
	const primaryDevEnv = isMultiworker
		? new DevEnv({
				runtimeFactories: [
					(devEnv) =>
						new MultiworkerRuntimeController(devEnv, inputs.length),
				],
			})
		: new DevEnv();
	const auxiliaryDevEnvs = auxiliaryWorkers.map(
		() =>
			new DevEnv({
				runtimeFactories: [() => primaryDevEnv.runtimes[0]],
				proxyFactory: (devEnv) => new NoOpProxyController(devEnv),
			}),
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
	inputs: StartDevWorkerInput[],
) {
	try {
		for (const [index, workerInput] of inputs.entries()) {
			const devEnv = session.devEnvs[index];
			await devEnv.config.set(workerInput, true);
		}
	} catch (error) {
		await Promise.allSettled(session.devEnvs.map((devEnv) => devEnv.teardown()));
		throw error;
	}
}

function maybePrintScheduledWorkerWarning(
	serverSession: ServerSession,
	url: URL,
): void {
	const workersWithCronTriggers = serverSession.devEnvs
		.map((devEnv) => devEnv.config.latestConfig)
		.filter((config): config is StartDevWorkerOptions => config !== undefined)
		.filter((config) =>
			config.triggers?.some((trigger) => trigger.type === "cron"),
		);

	if (workersWithCronTriggers.length === 0) {
		return;
	}

	const testScheduled = workersWithCronTriggers.every(
		(config) => config.dev.testScheduled,
	);
	if (testScheduled) {
		return;
	}

	const host =
		url.hostname === "0.0.0.0" || url.hostname === "::"
			? "localhost"
			: url.hostname.includes(":")
				? `[${url.hostname}]`
				: url.hostname;

	logger.once.warn(
		`Scheduled Workers are not automatically triggered during local development.\n` +
			`To manually trigger a scheduled event, run:\n` +
			`  curl "http://${host}:${url.port}/cdn-cgi/handler/scheduled"\n` +
			`For more details, see https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally`,
	);
}

/**
 * Creates a worker server with a small, migration-focused API surface.
 *
 * This intentionally reuses DevEnv/controller internals with minimal behavior changes.
 */
export function createServer(options: ServerOptions): WorkerServer {
	let currentOptions = options;
	let accountId = options.accountId;

	let serverSession: ServerSession | undefined;
	let startPromise: Promise<void> | undefined;
	let unregisterHotKeys: (() => void) | undefined;
	let hotKeysOptions: ServerHotKeysOptions | undefined;
	let shouldRenderHotKeys = true;

	const resolveSession = () => {
		assert(
			serverSession,
			"Worker server has not been started. Call server.listen().",
		);
		return serverSession;
	};

	const unregisterActiveHotKeys = () => {
		unregisterHotKeys?.();
		unregisterHotKeys = undefined;
	};

	const registerActiveHotKeys = (
		session: ServerSession,
		render = shouldRenderHotKeys,
	) => {
		if (!hotKeysOptions) {
			return;
		}

		unregisterActiveHotKeys();
		unregisterHotKeys = registerDevHotKeys(
			session.devEnvs,
			hotKeysOptions,
			render,
		);
	};

	const serverAuthHook: ServerAuthHook = async (config) => {
		if (accountId) {
			return {
				accountId,
				apiToken: requireApiToken(),
			};
		}

		unregisterActiveHotKeys();

		try {
			accountId = await requireAuth(config);
			return {
				accountId,
				apiToken: requireApiToken(),
			};
		} finally {
			if (serverSession) {
				registerActiveHotKeys(serverSession, false);
			}
		}
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
				},
			);
		});
	};

	const startServerSession = async (renderHotKeys = shouldRenderHotKeys) => {
		const session = await createSession(currentOptions, serverAuthHook);

		try {
			const ready = await waitForPrimaryReady(session);
			serverSession = session;
			maybePrintScheduledWorkerWarning(session, ready.url);
			registerActiveHotKeys(session, renderHotKeys);
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
		async waitUntilExit() {
			if (!serverSession && startPromise) {
				await startPromise;
			}
			const session = resolveSession();
			await events.once(session.primaryDevEnv, "teardown");
		},
		async fetch(info, init) {
			const session = resolveSession();
			const miniflare = session.primaryDevEnv.proxy.proxyWorker;
			assert(miniflare, "The proxy worker is not available yet. Did you call server.listen()?");

			return miniflare.dispatchFetch(info, init);
		},
		getWorker(name?: string) {
			const getRuntimeMiniflare = async () => {
				const session = resolveSession();
				await session.primaryDevEnv.proxy.runtimeMessageMutex.drained();
				const miniflare = session.primaryDevEnv.runtimes[0].mf;
				assert(miniflare, "Worker runtime is not available.");
				return miniflare;
			};

			return {
				async fetch(requestInput, requestInit) {
					const miniflare = await getRuntimeMiniflare();
					const request = new Request(requestInput, requestInit);
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
					const miniflare = await getRuntimeMiniflare();
					const url = new URL("http://localhost/cdn-cgi/handler/scheduled");
					if (scheduledOptions?.cron !== undefined) {
						url.searchParams.set("cron", scheduledOptions.cron);
					}
					if (scheduledOptions?.scheduledTime !== undefined) {
						url.searchParams.set(
							"time",
							String(scheduledOptions.scheduledTime.getTime()),
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
		registerHotKeys(serverHotKeysOptions) {
			hotKeysOptions = serverHotKeysOptions;
			shouldRenderHotKeys = serverHotKeysOptions.render ?? true;

			if (serverSession) {
				registerActiveHotKeys(serverSession, shouldRenderHotKeys);
			}
		},
		async update(updateInput) {
			currentOptions =
				typeof updateInput === "function"
					? updateInput(currentOptions)
					: updateInput;
			accountId = currentOptions.accountId ?? accountId;

			if (serverSession) {
				const nextInputs = resolveWorkerInputs(currentOptions, serverAuthHook);

				if (nextInputs.length !== serverSession.devEnvs.length) {
					const previousSession = serverSession;
					serverSession = undefined;
					await teardownSession(previousSession);
					await startServerSession(false);
					return;
				}

				await updateConfig(serverSession, nextInputs);
			}
		},
		async close() {
			if (startPromise) {
				await startPromise.catch(() => undefined);
				startPromise = undefined;
			}
			if (serverSession) {
				unregisterActiveHotKeys();
				await teardownSession(serverSession);
				serverSession = undefined;
			}
		},
	};

	return workerServer;
}
