import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";
import { compileModuleRules, testRegExps } from "miniflare";
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
import type {
	Miniflare,
	MessageEvent as MiniflareMessageEvent,
	WebSocket,
} from "miniflare";
import type {
	PoolOptions,
	PoolWorker,
	WorkerRequest,
	WorkerResponse,
} from "vitest/node";

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
	const entries = Object.entries(response).flatMap(([specifier, module]) => {
		try {
			const inlinedModule = inlineCachedModule(module, cacheContents);
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

export class CloudflarePoolWorker implements PoolWorker {
	name = "cloudflare-pool";
	private readonly debug = util.debuglog("vitest-plugin");
	private readonly moduleFetchRequestIds = new Set<string>();
	private mf: Miniflare | undefined;
	private socket: WebSocket | undefined;
	private parsedPoolOptions: WorkersPoolOptionsWithDefines | undefined;
	private main: string | undefined;
	// Store wrapped listeners so off() can remove them correctly.
	// Vitest registers at most one listener per event type.
	private messageListener?: (event: MiniflareMessageEvent) => void;
	private errorListener?: (event: Event) => void;
	private closeListener?: () => void;

	constructor(
		private options: PoolOptions,
		private poolOptions:
			| WorkersPoolOptions
			| ((
					ctx: WorkerPoolOptionsContext
			  ) => Promise<WorkersPoolOptions> | WorkersPoolOptions)
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
			resolvedPoolOptions
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
		this.moduleFetchRequestIds.clear();
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
		if (
			rpcResponse.t === "s" &&
			typeof rpcResponse.i === "string" &&
			this.moduleFetchRequestIds.delete(rpcResponse.i) &&
			rpcResponse.r !== undefined
		) {
			const inlined = inlineCachedModules(rpcResponse.r);
			if (inlined !== rpcResponse.r) {
				const inlinedResponse = { ...message, r: inlined };
				toSend = inlinedResponse;
			}
		}
		this.socket.send(structuredSerializableStringify(toSend));
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
					this.moduleFetchRequestIds.add(d.i);
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
			this.closeListener = callback as () => void;
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
