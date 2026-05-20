import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Headers, Request } from "miniflare";
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
			root?: string;
			configPath: string | URL;
			env?: string;
	  }
	| {
			root?: string;
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
	root?: string | undefined;
	workers: WorkerInput[];
	server?: DevServerOptions | undefined;
	inspector?: InspectorOptions | undefined;
	persist?: boolean | string | undefined;
	watch?: boolean | undefined;
	logLevel?: LogLevel | undefined;
	accountId?: string | undefined;
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
		const dev: StartDevWorkerInput["dev"] = {
			auth,
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
			multiworkerPrimary: isPrimaryWorker && isMultiworker ? true : undefined,
		};
		const root = input.root ?? options.root ?? cwd;

		if ("config" in input) {
			const config = input.config;

			return {
				// FIXME: to avoid dev env from auto discovering a config file and merging it with the inline config
				config: "",
				name: config.name,
				entrypoint: config.main ? resolvePath(root, config.main) : undefined,
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
				dev,
			};
		}

		if ("configPath" in input) {
			return {
				config: resolvePath(root, input.configPath),
				env: input.env,
				dev,
			};
		}

		throw new Error(
			`Invalid worker input at index ${index}. Expected an object with either a "config" property or a "configPath" property.`
		);
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

// TODO: Do we want this?
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

	const startServerSession = async () => {
		const session = await createSession(currentOptions, serverAuthHook);

		try {
			const ready = await waitForPrimaryReady(session);
			serverSession = session;
			maybePrintScheduledWorkerWarning(session, ready.url);
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
		async fetch(info, init) {
			const session = resolveSession();
			const miniflare = session.primaryDevEnv.proxy.proxyWorker;
			assert(
				miniflare,
				"The proxy worker is not available yet. Did you call server.listen()?"
			);

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

				await updateConfig(serverSession, nextInputs);
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
