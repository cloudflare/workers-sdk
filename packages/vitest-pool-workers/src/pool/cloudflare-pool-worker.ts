import { compileModuleRules, testRegExps } from "miniflare";
import { type ProvidedContext } from "vitest";
import { type WorkerPoolOptionsContext } from "../config";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { parseProjectOptions } from "./config";
import {
	getDurableObjectDesignators,
	getProjectMiniflare,
	getRunnerName,
	maybeGetResolvedMainPath,
	runTests,
	structuredSerializableParse,
	structuredSerializableStringify,
} from ".";
import type {
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import type { Miniflare, WebSocket } from "miniflare";
import type {
	PoolOptions,
	PoolWorker,
	WorkerRequest,
	WorkerResponse,
} from "vitest/node";

export interface CustomOptions {
	customProperty: "a" | "b";
}

export class CloudflarePoolWorker implements PoolWorker {
	name = "cloudflare-pool";
	private mf: Miniflare | undefined;
	private socket: WebSocket;
	private parsedOptions: WorkersPoolOptionsWithDefines;

	constructor(
		private options: PoolOptions,
		private customOptions:
			| WorkersPoolOptions
			| ((
					ctx: WorkerPoolOptionsContext
			  ) => Promise<WorkersPoolOptions> | WorkersPoolOptions)
	) {
		this.customOptions = customOptions;
	}

	async start(): Promise<void> {
		console.log("start");
		let poolOptions = this.customOptions;
		if (typeof poolOptions === "function") {
			// hhttps://github.com/vitest-dev/vitest/blob/v4.0.15/packages/vitest/src/integrations/inject.ts
			const inject = <K extends keyof ProvidedContext>(
				key: K
			): ProvidedContext[K] => {
				return this.options.project.getProvidedContext()[key];
			};
			poolOptions = await poolOptions({ inject });
		}

		this.parsedOptions = await parseProjectOptions(
			this.options.project,
			poolOptions
		);
		const main = maybeGetResolvedMainPath(
			this.options.project,
			this.parsedOptions
		);
		// this.options.project.provide(
		// 	"cloudflarePoolOptions",
		// 	JSON.stringify({
		// 		// Include resolved `main` if defined, and the names of Durable Object
		// 		// bindings that point to classes in the current isolate in the
		// 		// serialized config
		// 		main,
		// 		// Include designators of all Durable Object namespaces bound in the
		// 		// runner worker. We'll use this to list IDs in a namespace. We'll
		// 		// also use this to check Durable Object test runner helpers are
		// 		// only used with classes defined in the current worker, as these
		// 		// helpers rely on wrapping the object.
		// 		durableObjectBindingDesignators: [
		// 			...getDurableObjectDesignators(this.parsedOptions).entries(),
		// 		],
		// 		// Include whether isolated storage has been enabled for this
		// 		// project, so we know whether to call out to the loopback service
		// 		// to push/pop the storage stack between tests.
		// 		isolatedStorage: this.parsedOptions.isolatedStorage,
		// 	})
		// );

		this.mf = await getProjectMiniflare(
			this.options.project.vitest,
			this.options.project,
			this.parsedOptions
		);

		this.socket = await runTests(
			this.options.project.vitest,
			this.mf,
			getRunnerName(this.options.project),
			this.options.project,
			main
		);
		// this.socket.on(console.log);
		// console.log("start end");
		// this.thread ||= new Worker(
		// 	resolve(import.meta.dirname, "./../worker/lib/worker.mjs"),
		// 	{
		// 		env: this.env,
		// 		execArgv: this.execArgv,
		// 	}
		// );
	}

	async stop(): Promise<void> {
		await this.mf?.dispose();
		this.mf = undefined;
	}

	send(message: WorkerRequest): void {
		// console.log("SEND", message);

		const main = maybeGetResolvedMainPath(
			this.options.project,
			this.parsedOptions
		);
		// This is an initialisation message containing the config. Some properties need modifying
		if (message.type === "start") {
			// Users can write `vitest --inspect` to start an inspector connection for their tests
			// We intercept that option and use it to enable inspection of the Workers running in workerd
			// We need to stop it passing through into Vitest's in-Worker code, or Vitest will try and import
			// and run `inspector.open()` from `node:inspector`
			message.context.config.inspector ??= {};
			message.context.config.inspector.enabled = false;

			// The snapshot environment is exposed as `cloudflare:snapshot`
			message.context.config.snapshotEnvironment = "cloudflare:snapshot";
		} else if (message.type === "run") {
			message.context.providedContext.cloudflarePoolOptions = JSON.stringify({
				// Include resolved `main` if defined, and the names of Durable Object
				// bindings that point to classes in the current isolate in the
				// serialized config
				main,
				// Include designators of all Durable Object namespaces bound in the
				// runner worker. We'll use this to list IDs in a namespace. We'll
				// also use this to check Durable Object test runner helpers are
				// only used with classes defined in the current worker, as these
				// helpers rely on wrapping the object.
				durableObjectBindingDesignators: [
					...getDurableObjectDesignators(this.parsedOptions).entries(),
				],
				// Include whether isolated storage has been enabled for this
				// project, so we know whether to call out to the loopback service
				// to push/pop the storage stack between tests.
				isolatedStorage: this.parsedOptions.isolatedStorage,
			});
		}
		this.socket.send(structuredSerializableStringify(message));
		// this.options.project.vite.environments["v4_playground"].hot.send(
		// 	"vitest:message",
		// 	message
		// );
		// this.thread?.postMessage(message);
	}

	on(
		event: "error" | "exit" | "message",
		callback:
			| ((maybeError: unknown) => void)
			| (() => void)
			| ((response: WorkerResponse) => void)
	): void {
		const rules = this.parsedOptions.miniflare?.modulesRules;
		const compiledRules = compileModuleRules(rules ?? []);

		// console.log("ON", event, callback);
		if (event === "message") {
			this.socket.addEventListener("message", (m) => {
				const d = structuredSerializableParse(
					m.data as string
				) as WorkerResponse;
				// console.log("RECV POOL", d);
				if (
					d &&
					typeof d === "object" &&
					"m" in d &&
					"a" in d &&
					"i" in d &&
					Array.isArray(d.a) &&
					d.m === "fetch"
				) {
					const specifier = d.a[0];

					if (
						specifier !== "cloudflare:test" &&
						(/^(cloudflare|workerd):/.test(specifier) ||
							workerdBuiltinModules.has(specifier))
					) {
						return this.socket.send(
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
					if (maybeRule !== undefined) {
						const externalize =
							this.options.project.config.root +
							specifier +
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
			});
		} else if (event === "error") {
			this.socket.addEventListener("error", (e) => {
				(callback as (maybeError: unknown) => void)(e.error);
			});
		} else if (event === "exit") {
			this.socket.addEventListener("close", callback as () => void);
		}
	}

	off(_event: "exit", callback: () => void): void {
		this.socket.removeEventListener("close", callback as () => void);
	}
	deserialize(data: unknown) {
		return data;
	}
}
