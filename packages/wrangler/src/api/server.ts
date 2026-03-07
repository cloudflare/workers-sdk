import assert from "node:assert";
import events from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
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

export type ServerWorkerInput = Omit<StartDevWorkerInput, "config"> & {
	configPath?: string;
};

export type ServerBuildInput = {
	workers: ServerWorkerInput[];
	defaultWorker?: string;
};

export type ServerInput = {
	build?: ServerBuildInput;
	prebuiltConfigPath?: string;
	outbound?: ServiceFetch;
};

export type ServerInputUpdate = {
	build?: ServerInput["build"] | null;
	prebuiltConfigPath?: ServerInput["prebuiltConfigPath"] | null;
	outbound?: ServerInput["outbound"] | null;
};

export type ServerHotKeysOptions = {
	render?: boolean;
	forceLocal?: boolean;
	experimentalTailLogs: boolean;
	remote: boolean;
};

export type CreateServerOptions = {
	root: string;
	accountId?: string;
} & ServerInput;

export type ServerWorker = {
	fetch: DispatchFetch;
	scheduled(options: FetcherScheduledOptions): Promise<FetcherScheduledResult>;
};

export type ServerListenResult = {
	url: URL;
	inspectorUrl: URL | undefined;
};

export type WorkerServer = {
	listen(): Promise<ServerListenResult>;
	waitUntilExit(): Promise<void>;
	getWorker(name?: string): ServerWorker;
	registerHotKeys(options: ServerHotKeysOptions): void;
	update(
		input: ServerInputUpdate | ((current: ServerInput) => ServerInputUpdate)
	): Promise<void>;
	close(): Promise<void>;
};

type ServerWorkerRecord = {
	name: string;
	devEnv: DevEnv;
};

type ServerSession = {
	primaryDevEnv: DevEnv;
	devEnvs: DevEnv[];
	workers: ServerWorkerRecord[];
	defaultWorkerName: string;
};

type DeployConfig = {
	configPath: string;
	auxiliaryWorkers?: Array<{ configPath: string }>;
	prerenderWorkerConfigPath?: string;
};

type ServerAuthHook = NonNullable<
	NonNullable<StartDevWorkerInput["dev"]>["auth"]
>;

function normaliseServerInput(input: ServerInput): ServerInput {
	return {
		build: input.build,
		prebuiltConfigPath: input.prebuiltConfigPath,
		outbound: input.outbound,
	};
}

function cloneServerInput(input: ServerInput): ServerInput {
	return {
		build: input.build
			? {
					defaultWorker: input.build.defaultWorker,
					workers: input.build.workers.map((worker) => ({ ...worker })),
				}
			: undefined,
		prebuiltConfigPath: input.prebuiltConfigPath,
		outbound: input.outbound,
	};
}

function applyUpdatePatch(
	current: ServerInput,
	patch: ServerInputUpdate
): ServerInput {
	const next = cloneServerInput(current);

	if (patch.build !== undefined) {
		next.build = patch.build === null ? undefined : patch.build;
	}
	if (patch.prebuiltConfigPath !== undefined) {
		next.prebuiltConfigPath =
			patch.prebuiltConfigPath === null ? undefined : patch.prebuiltConfigPath;
	}
	if (patch.outbound !== undefined) {
		next.outbound = patch.outbound === null ? undefined : patch.outbound;
	}

	return next;
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

function readPrebuiltBuildInput(prebuiltConfigPath: string): ServerBuildInput {
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
	const workers: ServerWorkerInput[] = [
		{
			configPath: resolvePathFrom(configDir, rawParsed.configPath),
			dev: {
				server: { hostname: "127.0.0.1", port: 0 },
				inspector: false,
			},
		},
	];

	for (const auxiliaryWorker of rawParsed.auxiliaryWorkers ?? []) {
		workers.push({
			configPath: resolvePathFrom(configDir, auxiliaryWorker.configPath),
			dev: {
				inspector: false,
			},
		});
	}

	if (rawParsed.prerenderWorkerConfigPath) {
		workers.push({
			configPath: resolvePathFrom(
				configDir,
				rawParsed.prerenderWorkerConfigPath
			),
			dev: {
				inspector: false,
			},
		});
	}

	return { workers };
}

function toStartDevWorkerInput(
	root: string,
	input: ServerWorkerInput,
	outbound: ServiceFetch | undefined,
	multiworkerPrimary: boolean | undefined,
	auth: ServerAuthHook
): StartDevWorkerInput {
	const { configPath, entrypoint, dev, ...rest } = input;

	return {
		...rest,
		config: configPath ? resolvePathFrom(root, configPath) : undefined,
		entrypoint: entrypoint ? resolvePathFrom(root, entrypoint) : entrypoint,
		dev: {
			...dev,
			auth: dev?.auth ?? auth,
			outboundService: outbound ?? dev?.outboundService,
			multiworkerPrimary,
		},
	};
}

async function createSession(
	root: string,
	input: ServerInput,
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
		const workers: ServerWorkerRecord[] = [];
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
			const workerName =
				devEnv.config.latestConfig?.name ??
				workerInput.name ??
				`worker-${index + 1}`;
			workers.push({
				name: workerName,
				devEnv,
			});
		}

		return {
			primaryDevEnv,
			devEnvs,
			workers,
			defaultWorkerName: build.defaultWorker ?? workers[0].name,
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
	const workersWithCronTriggers = serverSession.workers
		.map((worker) => worker.devEnv.config.latestConfig)
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
	const root = resolvePathFrom(process.cwd(), options.root);
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

	const startServerSession = async (renderHotKeys = shouldRenderHotKeys) => {
		const session = await createSession(root, input, serverAuthHook);

		try {
			const ready = await session.primaryDevEnv.proxy.ready.promise;
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
				const resolvedWorkerName = name ?? session.defaultWorkerName;
				const worker = session.workers.find(
					(record) => record.name === resolvedWorkerName
				);
				assert(
					worker,
					`No worker named "${resolvedWorkerName}" found in server.`
				);
				const miniflare = worker.devEnv.runtimes[0].mf;
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
			const patch =
				typeof updateInput === "function"
					? updateInput(cloneServerInput(input))
					: updateInput;
			input = applyUpdatePatch(input, patch);

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
