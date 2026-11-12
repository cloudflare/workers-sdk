import assert from "node:assert";
import fs from "node:fs";
import { resolveDockerHost } from "@cloudflare/containers-shared";
import {
	getD1MigrationFiles,
	splitSqlQuery,
	UserError,
} from "@cloudflare/workers-utils";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import {
	WorkflowInstanceIntrospectorHandle,
	WorkflowIntrospectorHandle,
} from "@cloudflare/workflows-shared/src/introspection";
import { CorePaths, Headers, Miniflare, Request } from "miniflare";
import {
	buildMigrationQuery,
	findDrizzleLayoutHint,
	getCreateMigrationsTableQuery,
	getListAppliedMigrationsQuery,
	getUnappliedMigrationNames,
	resolveMigrationsConfig,
} from "./d1-migrations";
import { disposeRemoteProxySessions, resolveWorkerInputs } from "./runtime";
import type { ResolvedWorker } from "./runtime";
import type {
	AnyEnv,
	FetcherEmailResult,
	TestHarness,
	TestHarnessOptions,
	WorkerEnv,
	WorkerHandle,
	WorkerMainModule,
	WorkerModule,
} from "./types";
import type { Service } from "@cloudflare/workers-types";
import type { FetcherScheduledResult } from "@cloudflare/workers-types/experimental";
import type { WorkflowBinding } from "@cloudflare/workflows-shared/src/types";
import type {
	MiniflareOptions,
	RequestInfo,
	Response,
	WorkerdStructuredLog,
} from "miniflare";

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

	async function updateConfig(
		session: ServerSession,
		serverOptions: TestHarnessOptions
	) {
		const miniflare = await getRuntimeMiniflare(session);
		session.workers = await resolveWorkerInputs(serverOptions, session.workers);
		await miniflare.setOptions(getMiniflareOptions(session.workers));
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

	function resolveDurableObjectTarget(
		session: ServerSession,
		workerName: string,
		classNameOrBindingName: string
	) {
		// The bindings the Worker runs with, after `envOverrides`
		const workerConfig = getResolvedWorker(session, workerName).options.config;

		// Build Output declares Durable Object classes in `exports`, rather than
		// in migrations. Exports with `storage` are the live classes.
		const durableObjectClass = workerConfig.exports?.[classNameOrBindingName];
		if (
			durableObjectClass?.type === "durable-object" &&
			"storage" in durableObjectClass
		) {
			return {
				scriptName: workerName,
				className: classNameOrBindingName,
			};
		}

		const durableObject = workerConfig.env?.[classNameOrBindingName];
		if (durableObject?.type === "durable-object") {
			return {
				scriptName: durableObject.worker,
				className: durableObject.exportName,
			};
		}

		throw new TypeError(
			`No Durable Object class or namespace binding named ${JSON.stringify(classNameOrBindingName)} found in ${JSON.stringify(workerName)} worker.`
		);
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
			// The host is 127.0.0.1, so the URL is never a wildcard address
			resolvedInput = new URL(input, await miniflare.ready);
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
			Module extends WorkerModule = WorkerMainModule<Env>,
		>(name?: string): WorkerHandle<WorkerEnv<Env>, Module> {
			async function getWorkflowBinding(bindingName: string) {
				const session = await resolveSession();
				const miniflare = await getRuntimeMiniflare(session);
				const workerName = resolveWorkerName(session, name);
				const bindingConfig = getResolvedWorker(session, workerName).options
					.config.env?.[bindingName];

				if (bindingConfig?.type !== "workflow") {
					throw new TypeError(
						`No Workflow binding named ${JSON.stringify(bindingName)} found in ${JSON.stringify(workerName)} worker.`
					);
				}

				const bindings =
					await miniflare.getBindings<Record<string, unknown>>(workerName);
				const workflow = bindings[bindingName] as WorkflowBinding | undefined;

				if (!workflow) {
					throw new TypeError(
						`Workflow binding ${JSON.stringify(bindingName)} is not available in ${JSON.stringify(workerName)} worker.`
					);
				}

				return workflow;
			}

			return {
				async introspectWorkflow(bindingName) {
					const workflow = await getWorkflowBinding(bindingName);

					const introspector = new WorkflowIntrospectorHandle(workflow);
					await introspector.start();
					return introspector;
				},
				async introspectWorkflowInstance(bindingName, instanceId) {
					const workflow = await getWorkflowBinding(bindingName);

					return new WorkflowInstanceIntrospectorHandle(workflow, instanceId);
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
				async listDurableObjectIds(classNameOrBindingName) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					debugLog(
						`durable object ids - ${classNameOrBindingName} - started`,
						workerName
					);

					try {
						const ids = await miniflare.listDurableObjectIds(
							classNameOrBindingName,
							workerName
						);
						debugLog(
							`durable object ids - ${classNameOrBindingName} - completed (${ids.length} found)`,
							workerName
						);
						return ids;
					} catch (error) {
						debugLog(
							`durable object ids - ${classNameOrBindingName} - failed`,
							workerName
						);
						throw error;
					}
				},
				async applyD1Migrations(bindingName, migrationsOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const { projectDir } = getResolvedWorker(session, workerName);

					const database = await miniflare.getD1Database(
						bindingName,
						workerName
					);
					// Build Output has no migrations config, so these are options, as in
					// `cf d1 migrations apply --dir --pattern --table`
					const migrationConfig = resolveMigrationsConfig({
						...migrationsOptions,
						cwd: projectDir,
					});
					const resolvedMigrationsPath = migrationConfig.migrationsPath;

					debugLog(`d1 migrations - ${bindingName} - started`, workerName);

					try {
						if (!fs.existsSync(resolvedMigrationsPath)) {
							throw new UserError(
								`No migrations present at ${resolvedMigrationsPath}.`,
								{
									telemetryMessage:
										"d1 migrations missing migrations directory",
								}
							);
						}

						await database
							.prepare(
								getCreateMigrationsTableQuery(
									migrationConfig.migrationsTableName
								)
							)
							.run();
						const appliedMigrationNamesResult = await database
							.prepare(
								getListAppliedMigrationsQuery(
									migrationConfig.migrationsTableName
								)
							)
							.all<{ name: string }>();
						const migrationNames = getD1MigrationFiles({
							projectPath: projectDir,
							migrationsDir: migrationConfig.migrationsDir,
							migrationsPattern: migrationConfig.migrationsPattern,
						}).map((file) => file.name);
						if (migrationNames.length === 0) {
							const hint = findDrizzleLayoutHint(migrationConfig, projectDir);
							if (hint !== undefined) {
								console.warn(
									`No files matched the pattern "${migrationConfig.migrationsPattern}", but "${hint}" does match. ` +
										`If an ORM such as drizzle manages your migrations, set \`dir: "${migrationConfig.migrationsDir}"\` and \`pattern: "${hint}"\`.`
								);
							}
						}
						const unappliedMigrationNames = getUnappliedMigrationNames(
							migrationNames,
							appliedMigrationNamesResult.results.map((item) => item.name)
						);
						for (const migrationName of unappliedMigrationNames) {
							const query = buildMigrationQuery({
								migrationName,
								migrationsPath: resolvedMigrationsPath,
								migrationsTableName: migrationConfig.migrationsTableName,
							});
							await database.batch(
								splitSqlQuery(query).map((part) => database.prepare(part))
							);
							debugLog(
								`d1 migrations - ${bindingName} - applied ${migrationName}`,
								workerName
							);
						}

						if (migrationNames.length === 0) {
							debugLog(
								`d1 migrations - ${bindingName} - completed (no migrations found)`,
								workerName
							);
						} else if (unappliedMigrationNames.length === 0) {
							debugLog(
								`d1 migrations - ${bindingName} - completed (no migrations to apply)`,
								workerName
							);
						} else {
							debugLog(
								`d1 migrations - ${bindingName} - completed (${unappliedMigrationNames.length} applied)`,
								workerName
							);
						}
					} catch (error) {
						debugLog(`d1 migrations - ${bindingName} - failed`, workerName);
						throw error;
					}
				},
				async evictDurableObject(classNameOrBindingName, evictionOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const { scriptName, className } = resolveDurableObjectTarget(
						session,
						workerName,
						classNameOrBindingName
					);

					await miniflare.unsafeEvictDurableObject(
						scriptName,
						className,
						evictionOptions
					);
				},
				async getDurableObjectStorage(classNameOrBindingName, storageOptions) {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);
					const { scriptName, className } = resolveDurableObjectTarget(
						session,
						workerName,
						classNameOrBindingName
					);

					return miniflare.unsafeGetDurableObjectStorage(
						scriptName,
						className,
						storageOptions
					);
				},
				async getEnv() {
					const session = await resolveSession();
					const miniflare = await getRuntimeMiniflare(session);
					const workerName = resolveWorkerName(session, name);

					return miniflare.getBindings<WorkerEnv<Env>>(workerName);
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

				if (nextOptions.workers.length !== serverSession.workers.length) {
					throw new Error(
						`Updating the number of workers running in the server is not supported.`
					);
				}

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
