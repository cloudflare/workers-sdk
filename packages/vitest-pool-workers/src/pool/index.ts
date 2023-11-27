import assert from "node:assert";
import events from "node:events";
import path from "node:path";
import util from "node:util";
import { createBirpc } from "birpc";
import * as devalue from "devalue";
import { Miniflare, Log, LogLevel, WebSocket } from "miniflare";
import { createMethodsRPC } from "vitest/node";
import { modulesRoot, handleModuleFallbackRequest } from "./module-fallback";
import type { CloseEvent } from "miniflare";
import type { MessagePort } from "node:worker_threads";
import type {
	WorkerContext,
	RunnerRPC,
	RuntimeRPC,
	ResolvedConfig,
} from "vitest";
import type { ProcessPool, Vitest, WorkspaceProject } from "vitest/node";

let debuglog: util.DebugLoggerFunction = util.debuglog(
	"vitest-pool-workers:index",
	(log) => (debuglog = log)
);

// Building to an ES module, but Vite will provide `__dirname`
const distPath = path.resolve(__dirname, "..");
const poolWorkerPath = path.join(distPath, "worker", "index.mjs");

const ignoreMessages = [
	// Intentionally returning not found here to load module from root
	"error: Fallback service failed to fetch module; payload = load from root",
	// Not user actionable
	// "warning: Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set.",
	// Logged when closing the WebSocket
	// TODO(soon): this is normal operation and really shouldn't error
	"disconnected: operation canceled",
	"disconnected: worker_do_not_log; Request failed due to internal error",
	"disconnected: WebSocket was aborted",
];

console.log("Starting Cloudflare Workers runtime...");
const mf = new Miniflare({
	log: new Log(LogLevel.WARN),
	verbose: true,
	compatibilityFlags: [
		// Required
		"nodejs_compat",
		"export_commonjs_default",
		// For tests
		"global_navigator",
	],
	durableObjects: {
		__VITEST_POOL_WORKERS_RUNNER_OBJECT: {
			className: "RunnerObject",
			unsafePreventEviction: true,
		},
	},

	// For tests
	kvNamespaces: ["TEST_NAMESPACE"],

	// TODO: will need to consider how this works on Windows, still treat
	//  `/` as the root, then do things like `/C:/a/b/c/index.mjs`
	modulesRoot,
	modules: [{ type: "ESModule", path: poolWorkerPath }],

	unsafeEvalBinding: "__VITEST_POOL_WORKERS_UNSAFE_EVAL",
	unsafeUseModuleFallbackService: true,
	unsafeModuleFallbackService: handleModuleFallbackRequest,

	handleRuntimeStdio(stdout, stderr) {
		stdout.on("data", (chunk) => {
			process.stdout.write(chunk);
		});
		stderr.on("data", (chunk) => {
			const s = chunk.toString();
			if (ignoreMessages.some((message) => s.includes(message))) {
				return;
			}
			process.stderr.write(chunk);
		});
	},
});

export default function (ctx: Vitest): ProcessPool {
	let nextWorkerId = 0;
	async function runFiles(
		project: WorkspaceProject,
		config: ResolvedConfig,
		files: string[],
		invalidates: string[] = []
	) {
		// Allow workers to be re-used by removing the isolation requirement
		config.poolOptions ??= {};
		config.poolOptions.threads ??= {};
		config.poolOptions.threads.isolate = false;

		ctx.state.clearFiles(project, files);
		const data: WorkerContext = {
			port: undefined as unknown as MessagePort,
			config,
			files,
			invalidates,
			environment: { name: "node", options: null },
			workerId: ++nextWorkerId,
			projectName: project.getName(),
			providedContext: project.getProvidedContext(),
		};

		const res = await mf.dispatchFetch("http://placeholder", {
			headers: {
				Upgrade: "websocket",
				"MF-Vitest-Worker-Data": devalue.stringify({
					filePath: ctx.projectFiles.workerPath,
					name: "run",
					data,
				}),
			},
		});
		const webSocket = res.webSocket;
		assert(webSocket !== null);

		const localRpcFunctions = createMethodsRPC(project);
		const patchedLocalRpcFunctions: RuntimeRPC = {
			...localRpcFunctions,
			async fetch(...args) {
				// Always mark `cloudflare:test` as external
				if (args[0] === "cloudflare:test") return { externalize: args[0] };
				return localRpcFunctions.fetch(...args);
			},
		};
		const rpc = createBirpc<RunnerRPC, RuntimeRPC>(patchedLocalRpcFunctions, {
			eventNames: ["onCancel"],
			post(value) {
				if (webSocket.readyState === WebSocket.READY_STATE_OPEN) {
					debuglog("Pool sending message to worker...", value);
					webSocket.send(devalue.stringify(value));
				} else {
					debuglog("Pool tried to send message to worker but closed...", value);
				}
			},
			on(listener) {
				webSocket.addEventListener("message", (event) => {
					assert(typeof event.data === "string");
					debuglog("Pool received message from worker...", event.data);
					listener(devalue.parse(event.data));
				});
			},
		});
		project.ctx.onCancel((reason) => rpc.onCancel(reason));
		webSocket.accept();

		const [event] = (await events.once(webSocket, "close")) as [CloseEvent];
		if (webSocket.readyState === WebSocket.READY_STATE_CLOSING) {
			if (event.code === 1005 /* No Status Received */) {
				webSocket.close();
			} else {
				webSocket.close(event.code, event.reason);
			}
		}
		if (event.code !== 1000) {
			// TODO(soon): could we get the actual error here, use birpc custom event
			//  and throw with deferred promise
			throw new Error("Failed to run tests");
		}

		debuglog("DONE");

		// TODO(now): implement cancellation, can simulate this by CTRL-C'ing while
		//  tests are running

		// try {
		// 	await pool.run(data, { transferList: [workerPort], name: "run" });
		// } catch (error) {
		// 	// Worker got stuck and won't terminate - this may cause process to hang
		// 	if (
		// 		error instanceof Error &&
		// 		/Failed to terminate worker/.test(error.message)
		// 	)
		// 		ctx.state.addProcessTimeoutCause(
		// 			`Failed to terminate worker while running ${files.join(", ")}.`
		// 		);
		// 	// Intentionally cancelled
		// 	else if (
		// 		ctx.isCancelling &&
		// 		error instanceof Error &&
		// 		/The task has been cancelled/.test(error.message)
		// 	)
		// 		ctx.state.cancelFiles(files, ctx.config.root, project.getName());
		// 	else throw error;
		// } finally {
		// 	port.close();
		// 	workerPort.close();
		// }
	}

	return {
		name: "vitest-pool-workers",
		async runTests(specs, invalidates) {
			const configCache = new Map<WorkspaceProject, ResolvedConfig>();
			const serializeConfig = (project: WorkspaceProject): ResolvedConfig => {
				let config = configCache.get(project);
				if (config !== undefined) return config;
				config = project.getSerializableConfig();
				configCache.set(project, config);
				return config;
			};

			const results = await Promise.allSettled(
				specs.map(([project, file]) =>
					runFiles(project, serializeConfig(project), [file], invalidates)
				)
			);

			const errors = results
				.filter((r): r is PromiseRejectedResult => r.status === "rejected")
				.map((r) => r.reason);
			if (errors.length > 0)
				throw new AggregateError(
					errors,
					"Errors occurred while running tests. For more information, see serialized error."
				);
		},
		async close() {
			console.log("Closing pool...");
			await mf.dispose();
		},
	};
}
