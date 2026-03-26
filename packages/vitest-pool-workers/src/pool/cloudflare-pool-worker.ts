import assert from "node:assert";
import path from "node:path";
import { compileModuleRules, testRegExps } from "miniflare";
import { type ProvidedContext } from "vitest";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { parseProjectOptions, remoteProxySessionsDataMap } from "./config";
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

export class CloudflarePoolWorker implements PoolWorker {
	name = "cloudflare-pool";
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
			const inject = <K extends keyof ProvidedContext>(
				key: K
			): ProvidedContext[K] => {
				return this.options.project.getProvidedContext()[key];
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

		// Find the vitest-pool-workers plugin and give it the path to the main file.
		// This allows that plugin to inject a virtual dependency on main so that vitest
		// will automatically re-run tests when that gets updated, avoiding the user having
		// to manually add such an import in their tests.
		const configPlugin = this.options.project.vite.config.plugins.find(
			({ name }) => name === "@cloudflare/vitest-pool-workers"
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
		await this.mf?.dispose();
		this.mf = undefined;

		if (this.parsedPoolOptions?.wrangler?.configPath) {
			await remoteProxySessionsDataMap
				.get(this.parsedPoolOptions?.wrangler?.configPath)
				?.session?.dispose?.();
		}

		// Decrement the active worker count. When the last worker stops, this
		// closes file watchers created by buildPagesASSETSBinding() during config
		// evaluation — they're registered globally because vitest evaluates all
		// project configs at startup, even for projects that won't run.
		poolWorkerStopped();
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

		const rules = this.parsedPoolOptions.miniflare?.modulesRules;
		const compiledRules = compileModuleRules(rules ?? []);

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
						// `cloudflare:test` imports are handled by the `@cloudflare/vitest-pool-workers` plugin, and so should be ignored here
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
					// Skip if specifier already has query params (e.g. `?raw`), letting Vite handle it.
					if (maybeRule !== undefined && !specifier.includes("?")) {
						const externalize =
							path.join(this.options.project.config.root, specifier) +
							`?mf_vitest_force=${maybeRule.type}`;

						return this.socket.send(
							structuredSerializableStringify({
								t: "s",
								i: d.i,
								r: { externalize },
							})
						);
					}
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
