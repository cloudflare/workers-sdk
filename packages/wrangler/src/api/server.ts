import assert from "node:assert";
import events from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as find from "empathic/find";
import { Headers, Request } from "miniflare";
import registerDevHotKeys from "../dev/hotkeys";
import { logger } from "../logger";
import { requireApiToken, requireAuth } from "../user";
import { DevEnv } from "./startDevWorker/DevEnv";
import { MultiworkerRuntimeController } from "./startDevWorker/MultiworkerRuntimeController";
import { NoOpProxyController } from "./startDevWorker/NoOpProxyController";
import type {
	ServiceFetch,
	StartDevWorkerInput,
	StartDevWorkerOptions,
} from "./startDevWorker/types";
import type {
	FetcherScheduledOptions,
	FetcherScheduledResult,
} from "@cloudflare/workers-types/experimental";
import type { DispatchFetch } from "miniflare";

export type BuildConfig = {
	workers: StartDevWorkerInput[];
	defaultWorker?: string;
};

export type ServerOptions = {
	build?: BuildConfig;
	prebuiltConfigPath?: string;
	outbound?: ServiceFetch | null;
};

export type ServerHotKeysOptions = {
	render?: boolean;
	forceLocal?: boolean;
	experimentalTailLogs: boolean;
	remote: boolean;
};

export type CreateServerOptions = {
	root?: string;
	accountId?: string;
} & ServerOptions;

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
	prerenderWorkerConfigPath?: string;
};

type ServerAuthHook = NonNullable<
	NonNullable<StartDevWorkerInput["dev"]>["auth"]
>;

function normaliseServerInput(input: ServerOptions): ServerOptions {
	return {
		build: input.build,
		prebuiltConfigPath: input.prebuiltConfigPath,
		outbound: input.outbound,
	};
}

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

function findNearestPackageRoot(startDir: string): string | undefined {
	const packagePath = find.file("package.json", { cwd: startDir });
	return packagePath ? path.dirname(packagePath) : undefined;
}

function resolveRoot(root: string | undefined): string {
	if (root !== undefined) {
		return resolvePathFrom(process.cwd(), root);
	}

	return findNearestPackageRoot(process.cwd()) ?? process.cwd();
}

function readPrebuiltBuildInput(prebuiltConfigPath: string): BuildConfig {
	let rawParsed: unknown;
	try {
		rawParsed = JSON.parse(readFileSync(prebuiltConfigPath, "utf8"));
	} catch (error) {
		throw new Error(
			`Failed to read prebuilt deploy config at "${prebuiltConfigPath}".`,
			{ cause: error }
		);
	}

	if (!isDeployConfig(rawParsed)) {
		throw new Error(
			`Invalid prebuilt deploy config at "${prebuiltConfigPath}": missing "configPath".`
		);
	}

	const configDir = path.dirname(prebuiltConfigPath);
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

	if (rawParsed.prerenderWorkerConfigPath) {
		workers.push({
			config: resolvePathFrom(configDir, rawParsed.prerenderWorkerConfigPath),
		});
	}

	return { workers };
}

function toStartDevWorkerInput(
	root: string,
	input: StartDevWorkerInput,
	outbound: ServiceFetch | null | undefined,
	multiworkerPrimary: boolean | undefined,
	auth: ServerAuthHook
): StartDevWorkerInput {
	const { config: configPath, entrypoint, dev, ...rest } = input;

	if (outbound === undefined) {
		// eslint-disable-next-line no-restricted-globals
		outbound = (request) => fetch(request.url, request);
	}

	return {
		...rest,
		config: configPath ? resolvePathFrom(root, configPath) : undefined,
		entrypoint: entrypoint ? resolvePathFrom(root, entrypoint) : entrypoint,
		dev: {
			...dev,
			server: dev?.server ?? { hostname: "127.0.0.1", port: 0 },
			logLevel: dev?.logLevel ?? "error",
			watch: dev?.watch ?? false,
			inspector: dev?.inspector ?? false,
			auth: dev?.auth ?? auth,
			outboundService: outbound ?? dev?.outboundService,
			multiworkerPrimary,
		},
	};
}

async function createSession(
	root: string,
	input: ServerOptions,
	auth: ServerAuthHook
): Promise<ServerSession> {
	const build =
		input.build ??
		readPrebuiltBuildInput(
			input.prebuiltConfigPath ??
				path.resolve(root, ".wrangler", "deploy", "config.json")
		);

	const [primaryWorker, ...auxiliaryWorkers] = build.workers;

	if (!primaryWorker) {
		throw new Error("Worker server requires at least one worker.");
	}

	const isMultiworker = auxiliaryWorkers.length > 0;
	const primaryDevEnv = isMultiworker
		? new DevEnv({
				runtimeFactories: [
					(devEnv) =>
						new MultiworkerRuntimeController(devEnv, build.workers.length),
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
	const devEnvs = [primaryDevEnv, ...auxiliaryDevEnvs];

	try {
		for (const [index, workerInput] of build.workers.entries()) {
			const devEnv = devEnvs[index];
			await devEnv.config.set(
				toStartDevWorkerInput(
					root,
					workerInput,
					input.outbound,
					isMultiworker ? index === 0 : undefined,
					auth
				),
				true
			);
		}

		return {
			primaryDevEnv,
			devEnvs,
		};
	} catch (error) {
		await Promise.allSettled(devEnvs.map((devEnv) => devEnv.teardown()));
		throw error;
	}
}

function maybePrintScheduledWorkerWarning(
	serverSession: ServerSession,
	url: URL
): void {
	const workersWithCronTriggers = serverSession.devEnvs
		.map((devEnv) => devEnv.config.latestConfig)
		.filter((config): config is StartDevWorkerOptions => config !== undefined)
		.filter((config) =>
			config.triggers?.some((trigger) => trigger.type === "cron")
		);

	if (workersWithCronTriggers.length === 0) {
		return;
	}

	const testScheduled = workersWithCronTriggers.every(
		(config) => config.dev.testScheduled
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
			`For more details, see https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally`
	);
}

/**
 * Creates a worker server with a small, migration-focused API surface.
 *
 * This intentionally reuses DevEnv/controller internals with minimal behavior changes.
 */
export function createServer(options: CreateServerOptions): WorkerServer {
	const root = resolveRoot(options.root);

	let input = normaliseServerInput(options);
	let accountId = options.accountId;

	let serverSession: ServerSession | undefined;
	let startPromise: Promise<void> | undefined;
	let unregisterHotKeys: (() => void) | undefined;
	let hotKeysOptions: ServerHotKeysOptions | undefined;
	let shouldRenderHotKeys = true;

	const resolveSession = () => {
		assert(
			serverSession,
			"Worker server has not been started. Call server.listen()."
		);
		return serverSession;
	};

	const unregisterActiveHotKeys = () => {
		unregisterHotKeys?.();
		unregisterHotKeys = undefined;
	};

	const registerActiveHotKeys = (
		session: ServerSession,
		render = shouldRenderHotKeys
	) => {
		if (!hotKeysOptions) {
			return;
		}

		unregisterActiveHotKeys();
		unregisterHotKeys = registerDevHotKeys(
			session.devEnvs,
			hotKeysOptions,
			render
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
				}
			);
		});
	};

	const startServerSession = async (renderHotKeys = shouldRenderHotKeys) => {
		const session = await createSession(root, input, serverAuthHook);

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
	return {
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
		registerHotKeys(serverHotKeysOptions) {
			hotKeysOptions = serverHotKeysOptions;
			shouldRenderHotKeys = serverHotKeysOptions.render ?? true;

			if (serverSession) {
				registerActiveHotKeys(serverSession, shouldRenderHotKeys);
			}
		},
		async update(updateInput) {
			input =
				typeof updateInput === "function" ? updateInput(input) : updateInput;

			if (serverSession) {
				const previousSession = serverSession;
				serverSession = undefined;
				await teardownSession(previousSession);
				await startServerSession(false);
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
}
