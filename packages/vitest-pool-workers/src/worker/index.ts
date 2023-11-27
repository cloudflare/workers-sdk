import assert from "node:assert";
import events from "node:events";
import * as vm from "node:vm";
import { _setEnv } from "cloudflare:test";
import * as devalue from "devalue";

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

interface Env {
	__VITEST_POOL_WORKERS_RUNNER_OBJECT: DurableObjectNamespace;
	__VITEST_POOL_WORKERS_UNSAFE_EVAL: unknown;
}

export class RunnerObject implements DurableObject {
	constructor(_state: DurableObjectState, env: Env) {
		// @ts-expect-error `_setUnsafeEval()` is an internal method
		vm._setUnsafeEval(env.__VITEST_POOL_WORKERS_UNSAFE_EVAL);

		// Strip internal bindings from user facing `env`
		const userEnv: Record<string, unknown> = { ...env };
		delete userEnv.__VITEST_POOL_WORKERS_RUNNER_OBJECT;
		delete userEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL;
		_setEnv(userEnv);
	}

	async fetch(request: Request) {
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
			originalConsole.error("Erorr initialising worker:", error.stack);
			return Response.json(error, {
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			});
		}

		return new Response(null, { status: 101, webSocket: poolResponseSocket });
	}
}

export default <ExportedHandler<Env>>{
	fetch(request, env) {
		const id = env.__VITEST_POOL_WORKERS_RUNNER_OBJECT.idFromName("");
		const stub = env.__VITEST_POOL_WORKERS_RUNNER_OBJECT.get(id);
		return stub.fetch(request);
	},
};
