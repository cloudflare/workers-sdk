import assert from "node:assert";
import events from "node:events";
import * as vm from "node:vm";
import {
	setEnv,
	importModule,
	maybeHandleImportRequest,
	mustGetResolvedMainPath,
} from "cloudflare:test-internal";
import * as devalue from "devalue";
import type { VitestExecutor as VitestExecutorType } from "vitest/execute";

const originalConsole = console;

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

// HACK: `vitest/dist/vendor/vi.js` attempts to call `setTimeout` when setting
// up global mocks. Unfortunately, the runner Durable Object's IO context isn't
// preserved through `import()` so this fails. To get around this, look for
// the `setTimeout()` call and return a recognisable timeout value that's still
// `number` typed.
// @ts-expect-error __promisify__ types only required for Node.js
globalThis.setTimeout = (...args: Parameters<typeof setTimeout>) => {
	if (
		args[1] === 0 &&
		args[0].toString().replace(/\s/g, "") === "function(){returnundefined;}"
	) {
		return -0.5;
	}
	return originalSetTimeout.apply(globalThis, args);
};
// @ts-expect-error overload types not compatible
globalThis.clearTimeout = (...args: Parameters<typeof clearTimeout>) => {
	if (args[0] === -0.5) return;
	return originalClearTimeout.apply(globalThis, args);
};

// Wraps a `WebSocket` with a Node `MessagePort` like interface
class WebSocketMessagePort extends events.EventEmitter {
	constructor(private readonly socket: WebSocket) {
		super();
		socket.addEventListener("message", this.#onMessage);
		socket.accept();
	}

	#onMessage = (event: MessageEvent) => {
		assert(typeof event.data === "string");
		// originalConsole.log("Worker received message from pool...", event.data);
		const parsed = devalue.parse(event.data);
		this.emit("message", parsed);
	};

	postMessage(data: unknown) {
		// originalConsole.log("Worker sending message to pool...", data);
		const stringified = devalue.stringify(data);
		this.socket.send(stringified);
	}
}

interface JsonError {
	message?: string;
	name?: string;
	stack?: string;
	cause?: JsonError;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reduceError(e: any): JsonError {
	return {
		name: e?.name,
		message: e?.message ?? String(e),
		stack: e?.stack,
		cause: e?.cause === undefined ? undefined : reduceError(e.cause),
	};
}

export class RunnerObject implements DurableObject {
	executor: VitestExecutorType | undefined;

	constructor(_state: DurableObjectState, env: Env) {
		// @ts-expect-error `_setUnsafeEval()` is an internal method
		vm._setUnsafeEval(env.__VITEST_POOL_WORKERS_UNSAFE_EVAL);

		// Strip internal bindings from user facing `env`
		const userEnv: Record<string, unknown> = { ...env };
		delete userEnv.__VITEST_POOL_WORKERS_RUNNER_OBJECT;
		delete userEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL;
		setEnv(userEnv);
	}

	async handleVitestRunRequest(request: Request): Promise<Response> {
		assert.strictEqual(request.headers.get("Upgrade"), "websocket");
		const { 0: poolSocket, 1: poolResponseSocket } = new WebSocketPair();

		const workerDataHeader = request.headers.get("MF-Vitest-Worker-Data");
		assert(workerDataHeader !== null);
		const wd: unknown = devalue.parse(workerDataHeader);
		assert(typeof wd === "object" && wd !== null);
		assert("filePath" in wd && typeof wd.filePath === "string");
		assert("name" in wd && typeof wd.name === "string");
		assert("data" in wd && typeof wd.data === "object" && wd.data !== null);

		const port = new WebSocketMessagePort(poolSocket);
		try {
			const module = await import(wd.filePath);

			// HACK: Internally, the Vitest worker calls `startViteNode()`, which
			// constructs a singleton `VitestExecutor`. `VitestExecutor` is a subclass
			// of `ViteNodeRunner`, which is how the worker communicates with the
			// Vite server. We'd like access to this singleton so we can transform and
			// import code with Vite ourselves (e.g. for user worker's default exports
			// and Durable Objects). Unfortunately, Vitest doesn't publicly export the
			// `startViteNode()` function. Instead, we monkeypatch a `VitestExecutor`
			// method we know is called to get the singleton. :see_no_evil:
			// TODO(soon): see if we can get `startViteNode()` (https://github.com/vitest-dev/vitest/blob/8d183da4f7cc2986d11c802d16bacd221fb69b96/packages/vitest/src/runtime/execute.ts#L45)
			//  exported in `vitest/execute` (https://github.com/vitest-dev/vitest/blob/main/packages/vitest/src/public/execute.ts)
			const { VitestExecutor } = await import("vitest/execute");
			const originalResolveUrl = VitestExecutor.prototype.resolveUrl;
			// eslint-disable-next-line @typescript-eslint/no-this-alias
			const that = this;
			VitestExecutor.prototype.resolveUrl = function (...args) {
				that.executor = this;
				return originalResolveUrl.apply(this, args);
			};

			(wd.data as { port: WebSocketMessagePort }).port = port;
			module[wd.name](wd.data)
				.then(() => {
					poolSocket.close(1000, "Done");
				})
				.catch((e: unknown) => {
					const error = reduceError(e);
					originalConsole.error("Error running worker:", error.stack);
					poolSocket.close(1011, "Internal Error");
				});
		} catch (e) {
			const error = reduceError(e);
			originalConsole.error("Error initialising worker:", error.stack);
			return Response.json(error, {
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			});
		}

		return new Response(null, { status: 101, webSocket: poolResponseSocket });
	}

	async fetch(request: Request): Promise<Response> {
		// This will fail if this is an import request, and we haven't called
		// `handleVitestRunRequest()` yet
		const response = await maybeHandleImportRequest(this.executor, request);
		if (response !== undefined) return response;

		return this.handleVitestRunRequest(request);
	}
}

function createHandlerWrapper<K extends keyof ExportedHandler<Env>>(
	key: K
): NonNullable<ExportedHandler<Env>[K]> {
	return async (thing: unknown, env: Env, ctx: ExecutionContext) => {
		const mainPath = mustGetResolvedMainPath("service");
		const mainModule = await importModule(env, mainPath);
		const defaultExport =
			typeof mainModule === "object" &&
			mainModule !== null &&
			"default" in mainModule &&
			mainModule.default;
		const handlerFunction =
			typeof defaultExport === "object" &&
			defaultExport !== null &&
			key in defaultExport &&
			(defaultExport as Record<string, unknown>)[key];
		if (typeof handlerFunction === "function") {
			return handlerFunction.call(defaultExport, thing, env, ctx);
		} else {
			let message = `Handler does not export a ${key}() function.`;
			if (!defaultExport) {
				message +=
					"\nIt looks like your main module is missing a `default` export. `@cloudflare/vitest-pool-workers` does not support service workers." +
					"\nPlease migrate to the modules format: https://developers.cloudflare.com/workers/reference/migrate-to-module-workers.";
			}
			throw new Error(message);
		}
	};
}
const handler: Required<ExportedHandler<Env>> = {
	fetch: createHandlerWrapper("fetch"),
	tail: createHandlerWrapper("tail"),
	trace: createHandlerWrapper("trace"),
	scheduled: createHandlerWrapper("scheduled"),
	test: createHandlerWrapper("test"),
	email: createHandlerWrapper("email"),
	queue: createHandlerWrapper("queue"),
};
export default handler;

// Re-export user Durable Object wrappers
export * from "__VITEST_POOL_WORKERS_USER_OBJECT";
