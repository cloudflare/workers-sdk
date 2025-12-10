import path, { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { BirpcReturn } from "birpc";
import { Miniflare } from "miniflare";
import { RunnerRPC, RuntimeRPC } from "vitest";
import { workerdBuiltinModules } from "../shared/builtin-modules";
import { SocketLike } from "../shared/chunking-socket";
import {
	parseProjectOptions,
	WorkersPoolOptions,
	WorkersPoolOptionsWithDefines,
} from "./config";
import { waitForStorageReset } from "./loopback";
import {
	getDurableObjectDesignators,
	getProjectMiniflare,
	maybeGetResolvedMainPath,
	runTests,
	structuredSerializableParse,
	structuredSerializableStringify,
} from ".";
import type { PoolOptions, PoolWorker, WorkerRequest } from "vitest/node";

export interface CustomOptions {
	customProperty: "a" | "b";
}

export class CustomPoolWorker implements PoolWorker {
	name = "custom-pool";
	private thread?: Worker;
	readonly execArgv: string[];
	readonly env: Partial<NodeJS.ProcessEnv>;
	private mf: Miniflare;
	private socket: SocketLike<string>;

	constructor(
		private options: PoolOptions,
		private customOptions: WorkersPoolOptions
	) {
		console.log("construct", options.project.testFilesList);
		// const e = options.project.vite.environments["v4_playground"];
		// console.log(e);
		// console.log(e.hot.send("vitest:hot:construct", "hello world"));
		this.env = options.env;
		this.execArgv = options.execArgv;
		this.customOptions = customOptions;
	}

	async start(): Promise<void> {
		console.log("start");

		const parsedOptions = await parseProjectOptions(
			this.options.project,
			this.customOptions
		);
		this.options.project.provide(
			"cloudflarePoolOptions",
			JSON.stringify({
				// Include resolved `main` if defined, and the names of Durable Object
				// bindings that point to classes in the current isolate in the
				// serialized config
				main: maybeGetResolvedMainPath(this.options.project, parsedOptions),
				// Include designators of all Durable Object namespaces bound in the
				// runner worker. We'll use this to list IDs in a namespace. We'll
				// also use this to check Durable Object test runner helpers are
				// only used with classes defined in the current worker, as these
				// helpers rely on wrapping the object.
				durableObjectBindingDesignators:
					getDurableObjectDesignators(parsedOptions),
				// Include whether isolated storage has been enabled for this
				// project, so we know whether to call out to the loopback service
				// to push/pop the storage stack between tests.
				isolatedStorage: parsedOptions.isolatedStorage,
			})
		);

		this.mf = await getProjectMiniflare(
			this.options.project.vitest,
			this.options.project,
			parsedOptions
		);

		this.socket = await runTests(
			this.options.project.vitest,
			this.mf,
			"vitest-pool-workers-runner-",
			this.options.project
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
		console.log("stop");

		await waitForStorageReset(this.mf);
		await this.mf.dispose();
		await this.thread?.terminate();
		this.thread = undefined;
	}

	send(message: WorkerRequest): void {
		console.log("SEND", message);

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
		}
		this.socket.post(structuredSerializableStringify(message));
		// this.options.project.vite.environments["v4_playground"].hot.send(
		// 	"vitest:message",
		// 	message
		// );
		// this.thread?.postMessage(message);
	}

	on(event: string, callback: (arg: any) => void): void {
		// console.log("ON", event, callback);
		if (event !== "message") {
			return;
		}
		this.socket.on((m) => {
			const d = structuredSerializableParse(m);
			console.log("RECV POOL", d);
			if (
				d &&
				typeof d === "object" &&
				"m" in d &&
				"a" in d &&
				"i" in d &&
				Array.isArray(d.a) &&
				d.m === "fetch"
			) {
				const absoluteSpecifier = d.a[0];
				const relativeSpecifier = path.relative(
					this.options.project.config.root,
					absoluteSpecifier
				);
				if (
					relativeSpecifier !== "cloudflare:test" &&
					(/^(cloudflare|workerd):/.test(relativeSpecifier) ||
						workerdBuiltinModules.has(relativeSpecifier))
				) {
					return this.socket.post(
						structuredSerializableStringify({
							t: "s",
							i: d.i,
							r: { externalize: relativeSpecifier },
						})
					);
				}
			}
			callback(d);
		});
		// this.thread?.on(event, callback);
	}

	off(event: string, callback: (arg: any) => void): void {
		// this.thread?.off(event, callback);
	}
	deserialize(data: unknown) {
		return data;
	}
}
