import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { compileModuleRules, Log, LogLevel, testRegExps } from "miniflare";
import { type ProvidedContext } from "vitest";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { disposeAllRemoteProxySessions, parseProjectOptions } from "./config";
import { poolWorkerStarted, poolWorkerStopped } from "./pages";
import { type WorkerPoolOptionsContext } from "./plugin";
import {
	assertCompatibleVitestVersion,
	connectToMiniflareSocket,
	getDurableObjectDesignators,
	getProjectMiniflare,
	getRunnerName,
	maybeGetResolvedMainPath,
	structuredSerializableParse,
	structuredSerializableStringify,
} from ".";
import type {
	WorkersConfigPluginAPI,
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import type { Logger } from "@cloudflare/workers-utils";
import type {
	Miniflare,
	CloseEvent as MiniflareCloseEvent,
	MessageEvent as MiniflareMessageEvent,
	WebSocket,
} from "miniflare";
import type {
	PoolOptions,
	PoolWorker,
	WorkerRequest,
	WorkerResponse,
} from "vitest/node";

const log = new Log(LogLevel.INFO, { prefix: "vpw" });

type ModuleFetchMethod = "fetch" | "fetchWarmModules";

/**
 * On a filesystem-cache hit, Vitest sends `{ cached: true, tmp }` instead of
 * transformed `code`. Its worker then reads `tmp`, but workerd cannot access
 * that host path. Read it in Node and remove `cached` and `tmp` so Vitest uses
 * the supplied `code` instead of trying to read the file again.
 */
function inlineCachedModule(
	module: unknown,
	cacheContents: Map<string, string>
): unknown {
	if (
		module === null ||
		typeof module !== "object" ||
		!("cached" in module) ||
		module.cached !== true ||
		!("tmp" in module) ||
		typeof module.tmp !== "string"
	) {
		return module;
	}

	const { cached, tmp, ...result } = module;
	let code = cacheContents.get(tmp);
	if (code === undefined) {
		code = fs.readFileSync(tmp, "utf8");
		cacheContents.set(tmp, code);
	}
	return { ...result, code };
}

/**
 * `fetch()` returns one module result; `fetchWarmModules()` returns a map of
 * module IDs to results. Vitest checks the map before calling `fetch()`, so
 * both paths need inlining. Reuse reads within this reply because aliases in
 * the map can reference the same cache file.
 */
function inlineCachedModules(response: unknown): unknown {
	const cacheContents = new Map<string, string>();
	let inlined: unknown;
	try {
		inlined = inlineCachedModule(response, cacheContents);
	} catch {
		return response;
	}
	if (
		inlined !== response ||
		response === null ||
		typeof response !== "object" ||
		Array.isArray(response)
	) {
		return inlined;
	}

	let hasCachedModules = false;
	// Vitest keys a module under both its URL and its ID with one shared
	// object. Keep it shared so the serialized reply still writes it once and
	// `serializePartialWarmModulesReply()` counts it once.
	const inlinedModules = new Map<unknown, unknown>();
	const entries = Object.entries(response).flatMap(([specifier, module]) => {
		try {
			let inlinedModule = inlinedModules.get(module);
			if (inlinedModule === undefined) {
				inlinedModule = inlineCachedModule(module, cacheContents);
				inlinedModules.set(module, inlinedModule);
			}
			hasCachedModules ||= inlinedModule !== module;
			return [[specifier, inlinedModule] as const];
		} catch {
			// If the cache file disappeared, omit this entry so Vitest falls back
			// to `fetch()` for the module instead of using the stale snapshot path.
			hasCachedModules = true;
			return [];
		}
	});
	return hasCachedModules ? Object.fromEntries(entries) : response;
}

/**
 * workerd closes a WebSocket when it receives a message larger than this, with
 * close code 1009 ("Message is too large").
 */
const MAX_WEBSOCKET_MESSAGE_BYTES = 32 * 1024 * 1024;

/**
 * The sum of per-entry sizes in `serializePartialWarmModulesReply()` can
 * differ slightly from the size of the combined message, which also includes
 * the RPC envelope. Leave headroom so the combined message still fits.
 */
const WARM_MODULES_BUDGET_BYTES = MAX_WEBSOCKET_MESSAGE_BYTES - 1024 * 1024;

/**
 * Serialize a `fetchWarmModules()` reply that is too large for one WebSocket
 * message. The inlined code of a large import graph can exceed workerd's
 * limit. Vitest calls `fetch()` for any module missing from the snapshot, so
 * keep the entries that fit and leave the rest for Vitest to fetch one at a
 * time.
 *
 * @param message The BiRPC reply, with cached modules already inlined.
 * @returns The serialized reply, its size in bytes, and the number of
 * snapshot entries it kept and dropped.
 */
function serializePartialWarmModulesReply(message: { r?: unknown }): {
	serialized: string;
	bytes: number;
	kept: number;
	dropped: number;
} {
	const entries =
		message.r !== null && typeof message.r === "object"
			? Object.entries(message.r)
			: [];
	const kept: [string, unknown][] = [];
	const counted = new Set<unknown>();
	let remaining = WARM_MODULES_BUDGET_BYTES;
	for (const [specifier, module] of entries) {
		// devalue writes a shared object once, so an alias only costs its key.
		const size =
			Buffer.byteLength(JSON.stringify(specifier)) +
			(counted.has(module)
				? 0
				: Buffer.byteLength(structuredSerializableStringify(module)));
		if (size > remaining) {
			continue;
		}
		remaining -= size;
		counted.add(module);
		kept.push([specifier, module]);
	}

	let partial = structuredSerializableStringify({
		...message,
		r: Object.fromEntries(kept),
	});
	let partialBytes = Buffer.byteLength(partial);
	if (partialBytes > MAX_WEBSOCKET_MESSAGE_BYTES) {
		kept.length = 0;
		partial = structuredSerializableStringify({ ...message, r: {} });
		partialBytes = Buffer.byteLength(partial);
	}
	return {
		serialized: partial,
		bytes: partialBytes,
		kept: kept.length,
		dropped: entries.length - kept.length,
	};
}

export class CloudflarePoolWorker implements PoolWorker {
	name = "cloudflare-pool";
	private readonly debug = util.debuglog("vitest-plugin");
	private readonly moduleFetchRequests = new Map<string, ModuleFetchMethod>();
	private mf: Miniflare | undefined;
	private socket: WebSocket | undefined;
	private parsedPoolOptions: WorkersPoolOptionsWithDefines | undefined;
	private main: string | undefined;
	// Store wrapped listeners so off() can remove them correctly.
	// Vitest registers at most one listener per event type.
	private messageListener?: (event: MiniflareMessageEvent) => void;
	private errorListener?: (event: Event) => void;
	private closeListener?: (event: MiniflareCloseEvent) => void;

	constructor(
		private options: PoolOptions,
		private poolOptions:
			| WorkersPoolOptions
			| ((
					ctx: WorkerPoolOptionsContext
			  ) => Promise<WorkersPoolOptions> | WorkersPoolOptions),
		private readonly logger: Logger
	) {
		assertCompatibleVitestVersion(options.project.vitest);
	}

	async start(): Promise<void> {
		poolWorkerStarted();

		let resolvedPoolOptions: WorkersPoolOptions;
		if (typeof this.poolOptions === "function") {
			// https://github.com/vitest-dev/vitest/blob/v4.0.18/packages/vitest/src/integrations/inject.ts
			const inject: WorkerPoolOptionsContext["inject"] = <T = unknown>(
				key: string
			): T => {
				return this.options.project.getProvidedContext()[
					key as keyof ProvidedContext
				] as T;
			};
			resolvedPoolOptions = await this.poolOptions({ inject });
		} else {
			resolvedPoolOptions = this.poolOptions;
		}

		this.parsedPoolOptions = await parseProjectOptions(
			this.options.project,
			resolvedPoolOptions,
			this.logger
		);
		this.main = maybeGetResolvedMainPath(
			this.options.project,
			this.parsedPoolOptions
		);

		// Find the vitest-plugin plugin and give it the path to the main file.
		// This allows that plugin to inject a virtual dependency on main so that vitest
		// will automatically re-run tests when that gets updated, avoiding the user having
		// to manually add such an import in their tests.
		const configPlugin = this.options.project.vite.config.plugins.find(
			({ name }) => name === "@cloudflare/vitest-plugin"
		);
		if (configPlugin !== undefined) {
			const api = configPlugin.api as WorkersConfigPluginAPI;
			api.setMain(this.main);
		}

		this.mf = await getProjectMiniflare(
			this.options.project.vitest,
			this.options.project,
			this.parsedPoolOptions,
			this.main
		);

		this.socket = await connectToMiniflareSocket(
			this.mf,
			getRunnerName(this.options.project)
		);
	}

	async stop(): Promise<void> {
		this.socket?.close();
		this.socket = undefined;
		this.moduleFetchRequests.clear();
		// Disposal errors should not override the test result, but log them for
		// diagnostics in case they indicate an underlying teardown issue.
		await this.mf?.dispose().catch((err) => {
			this.debug("miniflare dispose rejected: %O", err);
		});
		this.mf = undefined;

		// Decrement the active worker count. When the last worker stops, this
		// closes file watchers created by buildPagesASSETSBinding() during config
		// evaluation — they're registered globally because vitest evaluates all
		// project configs at startup, even for projects that won't run.
		const wasLastWorker = poolWorkerStopped();

		// Remote proxy sessions are shared by all pool workers using the same
		// config file, and consecutive workers overlap, so only dispose them
		// once the last worker stops.
		if (wasLastWorker) {
			await disposeAllRemoteProxySessions().catch((err) => {
				this.debug("remote proxy session dispose rejected: %O", err);
			});
		}
	}

	send(message: WorkerRequest): void {
		// Vitest will always call `start()` before calling `send()`
		assert(this.socket, "Message sent to Worker before initialisation");
		assert(
			this.parsedPoolOptions,
			"Message sent to Worker before initialisation"
		);

		// Avoid mutating Vitest's message objects — shallow-copy the parts we modify
		let toSend: WorkerRequest = message;
		if (message.type === "start") {
			// Users can write `vitest --inspect` to start an inspector connection for their tests
			// We intercept that option and use it to enable inspection of the Workers running in workerd
			// We need to stop it passing through into Vitest's in-Worker code, or Vitest will try and import
			// and run `inspector.open()` from `node:inspector`
			toSend = {
				...message,
				context: {
					...message.context,
					config: {
						...message.context.config,
						inspector: {
							...message.context.config.inspector,
							enabled: false,
						},
					},
				},
			};
		} else if (message.type === "run") {
			// For some reason providing this using the Vitest `project.provide` API
			// doesn't work in Vitest Projects, and so we just provide the context directly
			toSend = {
				...message,
				context: {
					...message.context,
					providedContext: {
						...message.context.providedContext,
						cloudflarePoolOptions: JSON.stringify({
							// Include resolved `main` if defined
							main: this.main,
							// Include designators of all Durable Object namespaces bound in the
							// runner worker. We'll use this to list IDs in a namespace. We'll
							// also use this to check Durable Object test runner helpers are
							// only used with classes defined in the current worker, as these
							// helpers rely on wrapping the object.
							durableObjectBindingDesignators: [
								...getDurableObjectDesignators(
									this.parsedPoolOptions
								).entries(),
							],
							selfName: getRunnerName(this.options.project),
						}),
					},
				},
			};
		}
		// BiRPC marks calls with `t: "q"` and replies with `t: "s"`. Replies
		// carry the original request ID (`i`) and return value (`r`), but no
		// method name. Only rewrite replies to the module-fetch calls recorded
		// in on("message"): unrelated RPC results can look like cached modules.
		// Consume the ID even for failed replies (`e` without a result) so
		// finished requests do not leave stale state.
		// https://github.com/antfu-collective/birpc/blob/f5bb5a45b/src/index.ts#L202-L246
		const rpcResponse = message as { t?: string; i?: string; r?: unknown };
		let fetchMethod: ModuleFetchMethod | undefined;
		if (rpcResponse.t === "s" && typeof rpcResponse.i === "string") {
			fetchMethod = this.moduleFetchRequests.get(rpcResponse.i);
			this.moduleFetchRequests.delete(rpcResponse.i);
		}
		if (fetchMethod !== undefined && rpcResponse.r !== undefined) {
			const inlined = inlineCachedModules(rpcResponse.r);
			if (inlined !== rpcResponse.r) {
				const inlinedResponse = { ...message, r: inlined };
				toSend = inlinedResponse;
			}
		}
		let serialized = structuredSerializableStringify(toSend);
		if (fetchMethod === "fetchWarmModules") {
			const bytes = Buffer.byteLength(serialized);
			if (bytes > MAX_WEBSOCKET_MESSAGE_BYTES) {
				const partial = serializePartialWarmModulesReply(
					toSend as { r?: unknown }
				);
				this.debug(
					"warm-modules snapshot of %d bytes is over the %d-byte message limit; sending %d bytes with %d entries and leaving %d to fetch()",
					bytes,
					MAX_WEBSOCKET_MESSAGE_BYTES,
					partial.bytes,
					partial.kept,
					partial.dropped
				);
				serialized = partial.serialized;
			}
		}
		this.socket.send(serialized);
	}

	on(
		event: string,
		callback:
			| ((maybeError: unknown) => void)
			| (() => void)
			| ((response: WorkerResponse) => void)
	): void {
		// Vitest will always call `start()` before calling `on()`
		assert(this.socket, "Message received from Worker before initialisation");
		assert(
			this.parsedPoolOptions,
			"Message received from Worker before initialisation"
		);

		const compiledRules = compileModuleRules(
			this.parsedPoolOptions.moduleRules ?? []
		);

		if (event === "message") {
			const messageWrapper = (m: { data: string | ArrayBuffer }) => {
				const d = structuredSerializableParse(
					m.data as string
				) as WorkerResponse;

				// This is a birpc serialised message before it's been parsed, which is why the properties are so unintelligible
				// We're looking for a `fetch()` RPC call: https://github.com/vitest-dev/vitest/blob/v4.0.18/packages/vitest/src/types/rpc.ts#L8
				if (
					d &&
					typeof d === "object" &&
					"m" in d &&
					"a" in d &&
					"i" in d &&
					Array.isArray(d.a) &&
					d.m === "fetch"
				) {
					assert(
						this.socket,
						"Message received from Worker before initialisation"
					);
					const specifier = d.a[0];

					if (
						// `cloudflare:test` imports are handled by the `@cloudflare/vitest-plugin` plugin, and so should be ignored here
						specifier !== "cloudflare:test" &&
						(/^(cloudflare|workerd):/.test(specifier) ||
							workerdBuiltinModules.has(specifier))
					) {
						return this.socket.send(
							// Tell Vitest to treat this module as "external" and load it using a workerd module import
							structuredSerializableStringify({
								t: "s",
								i: d.i,
								r: { externalize: specifier },
							})
						);
					}

					const maybeRule = compiledRules.find((rule) =>
						testRegExps(rule.include, specifier)
					);
					const isWasmModuleSpecifier =
						maybeRule?.type === "CompiledWasm" &&
						specifier.endsWith(".wasm?module");
					// Skip most query params (e.g. `?raw`), letting Vite handle them.
					// `.wasm?module` is an alias for a compiled WebAssembly module, so
					// we still need to externalize it through the fallback service.
					if (
						maybeRule !== undefined &&
						(!specifier.includes("?") || isWasmModuleSpecifier)
					) {
						// Vite uses `/@fs/` for absolute dependency paths outside the
						// project root. Convert those back to real filesystem paths.
						let externalize = specifier.startsWith("/@fs/")
							? specifier.substring("/@fs".length)
							: path.join(this.options.project.config.root, specifier);

						if (isWasmModuleSpecifier) {
							externalize = externalize.slice(0, -"?module".length);
						}

						return this.socket.send(
							structuredSerializableStringify({
								t: "s",
								i: d.i,
								r: {
									externalize: `${externalize}?mf_vitest_force=${maybeRule.type}`,
								},
							})
						);
					}
				}
				// Track only calls forwarded to Vitest; fetches answered locally
				// above never pass through send() and need no response adaptation.
				if (
					d &&
					typeof d === "object" &&
					"t" in d &&
					d.t === "q" &&
					"m" in d &&
					(d.m === "fetch" || d.m === "fetchWarmModules") &&
					"i" in d &&
					typeof d.i === "string"
				) {
					this.moduleFetchRequests.set(d.i, d.m);
				}
				(callback as (response: WorkerResponse) => void)(d);
			};
			this.messageListener = messageWrapper as (
				event: MiniflareMessageEvent
			) => void;
			this.socket.addEventListener("message", this.messageListener);
		} else if (event === "error") {
			this.errorListener = (e: Event) => {
				(callback as (maybeError: unknown) => void)("error" in e ? e.error : e);
			};
			this.socket.addEventListener("error", this.errorListener);
		} else if (event === "exit") {
			this.closeListener = ({ code, reason }: MiniflareCloseEvent) => {
				// Vitest only reports that the worker exited, and only the first
				// error a worker emits reaches the test run, so log why the
				// runner's WebSocket closed before Vitest reports the exit.
				let message = `The runner's WebSocket closed with code ${code}${reason ? ` (${reason})` : ""}.`;
				if (code === 1009) {
					message += ` A message to the runner was over workerd's ${MAX_WEBSOCKET_MESSAGE_BYTES}-byte WebSocket message limit.`;
				}
				log.logWithLevel(LogLevel.ERROR, message);
				(callback as () => void)();
			};
			this.socket.addEventListener("close", this.closeListener);
		}
	}

	off(event: string, _callback: (_arg: unknown) => void): void {
		if (event === "message" && this.messageListener) {
			this.socket?.removeEventListener("message", this.messageListener);
			this.messageListener = undefined;
		} else if (event === "error" && this.errorListener) {
			this.socket?.removeEventListener("error", this.errorListener);
			this.errorListener = undefined;
		} else if (event === "exit" && this.closeListener) {
			this.socket?.removeEventListener("close", this.closeListener);
			this.closeListener = undefined;
		}
	}

	// Vitest does not have a corresponding `serialize()` option, so we can't actually use this for serialisation
	// Instead, we serialize/deserialize in the `send()` and `on()` methods.
	deserialize(data: unknown) {
		return data;
	}
}
