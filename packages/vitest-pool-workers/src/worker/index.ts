import assert from "node:assert";
import { Buffer } from "node:buffer";
import events from "node:events";
import process from "node:process";
import * as vm from "node:vm";
import defines from "__VITEST_POOL_WORKERS_DEFINES";
import {
	createWorkerEntrypointWrapper,
	internalEnv,
	maybeHandleRunRequest,
	registerHandlerAndGlobalWaitUntil,
	runInRunnerObject,
	setEnv,
} from "cloudflare:test-internal";
import * as devalue from "devalue";
// Using relative path here to ensure `esbuild` bundles it
import {
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "../../../miniflare/src/workers/core/devalue";
import { createChunkingSocket } from "../shared/chunking-socket";
import type { SocketLike } from "../shared/chunking-socket";
import type { VitestExecutor as VitestExecutorType } from "vitest/execute";

function structuredSerializableStringify(value: unknown): string {
	return devalue.stringify(value, structuredSerializableReducers);
}
function structuredSerializableParse(value: string): unknown {
	return devalue.parse(value, structuredSerializableRevivers);
}

globalThis.Buffer = Buffer; // Required by `vite-node/source-map`

globalThis.process = process; // Required by `vite-node`
process.argv = []; // Required by `@vitest/utils`
let cwd: string | undefined;
process.cwd = () => {
	assert(cwd !== undefined, "Expected cwd to be set");
	return cwd;
};
Object.setPrototypeOf(process, events.EventEmitter.prototype); // Required by `vitest`

globalThis.__console = console;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function getCallerFileName(of: Function): string | null {
	const originalStackTraceLimit = Error.stackTraceLimit;
	const originalPrepareStackTrace = Error.prepareStackTrace;
	try {
		let fileName: string | null = null;
		Error.stackTraceLimit = 1;
		Error.prepareStackTrace = (_error, callSites) => {
			fileName = callSites[0]?.getFileName();
			return "";
		};
		const error: { stack?: string } = {};
		Error.captureStackTrace(error, of);
		void error.stack; // Access to generate stack trace
		return fileName;
	} finally {
		Error.stackTraceLimit = originalStackTraceLimit;
		Error.prepareStackTrace = originalPrepareStackTrace;
	}
}

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

const timeoutPromiseResolves = new Map<unknown, () => void>();
const monkeypatchedSetTimeout = (...args: Parameters<typeof setTimeout>) => {
	const [callback, delay, ...restArgs] = args;
	const callbackName = args[0]?.name ?? "";
	const callerFileName = getCallerFileName(monkeypatchedSetTimeout);
	const fromVitest = /\/node_modules\/(\.store\/)?vitest/.test(
		callerFileName ?? ""
	);

	// If this `setTimeout()` isn't from Vitest, or has a non-zero delay,
	// just call the original function
	if (!fromVitest || delay) {
		return originalSetTimeout.apply(globalThis, args);
	}

	// HACK: `vitest/dist/vendor/vi.js` attempts to call `setTimeout` when setting
	// up global mocks. Unfortunately, the runner Durable Object's IO context
	// isn't preserved through `import()` so this fails. To get around this, look
	// for the `setTimeout()` call and return a recognisable timeout value that's
	// still `number` typed
	// (https://github.com/sinonjs/fake-timers/blob/c85ef142837afdbc732b0f73fdba30c3bd037965/src/fake-timers-src.js#L154)
	if (callbackName === "NOOP") {
		return -0.5;
	}

	// Make sure `setTimeout()`s from Vitest without delays are `waitUntil()`ed
	// if we're running within an `export default` handler. This ensures all
	// `console.log()`s are displayed, as Vitest uses `setTimeout()` for grouping.
	let promiseResolve: (() => void) | undefined;
	const promise = new Promise<void>((resolve) => {
		promiseResolve = resolve;
	});
	assert(promiseResolve !== undefined);
	registerHandlerAndGlobalWaitUntil(promise);
	const id = originalSetTimeout.call(globalThis, () => {
		promiseResolve?.();
		callback?.(...restArgs);
	});
	timeoutPromiseResolves.set(id, promiseResolve);
	return id;
};
// @ts-expect-error __promisify__ types only required for Node.js
globalThis.setTimeout = monkeypatchedSetTimeout;
// @ts-expect-error overload types not compatible
globalThis.clearTimeout = (...args: Parameters<typeof clearTimeout>) => {
	const id = args[0];
	if (id === -0.5) {
		return;
	}

	// Make sure we resolve any timeout promises we're clearing
	// (e.g. `console.log()`ing twice, the 2nd will clear the timeout set by the
	// first, but we'll still be `waitUntil()`ing on the original `Promise`)
	const maybePromiseResolve = timeoutPromiseResolves.get(id);
	timeoutPromiseResolves.delete(id);
	maybePromiseResolve?.();

	return originalClearTimeout.apply(globalThis, args);
};

function isDifferentIOContextError(e: unknown) {
	return (
		e instanceof Error &&
		e.message.startsWith("Cannot perform I/O on behalf of a different") // "request" or "Durable Object"
	);
}

// Wraps a `WebSocket` with a Node `MessagePort` like interface
class WebSocketMessagePort extends events.EventEmitter {
	#chunkingSocket: SocketLike<string>;

	constructor(private readonly socket: WebSocket) {
		super();
		this.#chunkingSocket = createChunkingSocket({
			post(message) {
				socket.send(message);
			},
			on(listener) {
				socket.addEventListener("message", (event) => {
					listener(event.data);
				});
			},
		});
		this.#chunkingSocket.on((message) => {
			const parsed = structuredSerializableParse(message);
			this.emit("message", parsed);
		});
		socket.accept();
	}

	postMessage(data: unknown) {
		const stringified = structuredSerializableStringify(data);
		try {
			// Accessing `readyState` may also throw different I/O context error
			if (this.socket.readyState === WebSocket.READY_STATE_OPEN) {
				this.#chunkingSocket.post(stringified);
			}
		} catch (error) {
			// If the user tried to perform a dynamic `import()` or `console.log()`
			// from inside a `export default { fetch() { ... } }` handler using `SELF`
			// or from inside their own Durable Object, Vitest will try to send an
			// RPC message from the I/O context that is different to the Runner Durable Object.
			// There's nothing we can really do to prevent this: we want to run these things
			// in different I/O contexts with the behaviour this causes. We'd still like to send
			// the RPC message though, so if we detect this, we try resend the message
			// from the runner object.
			if (isDifferentIOContextError(error)) {
				const promise = runInRunnerObject(internalEnv, () => {
					this.#chunkingSocket.post(stringified);
				}).catch((e) => {
					__console.error("Error sending to pool inside runner:", e, data);
				});
				registerHandlerAndGlobalWaitUntil(promise);
			} else {
				__console.error("Error sending to pool:", error, data);
			}
		}
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

let patchedFunction = false;
function ensurePatchedFunction(unsafeEval: UnsafeEval) {
	if (patchedFunction) {
		return;
	}
	patchedFunction = true;
	// `new Function()` is used by `@vitest/snapshot`
	globalThis.Function = new Proxy(globalThis.Function, {
		construct(_target, args, _newTarget) {
			// `new Function()` and `UnsafeEval#newFunction()` have reversed args
			const script = args.pop();
			return unsafeEval.newFunction(script, "anonymous", ...args);
		},
	});
}

function applyDefines() {
	// Based off `/@vite/env` implementation:
	// https://github.com/vitejs/vite/blob/v5.1.4/packages/vite/src/client/env.ts
	for (const [key, value] of Object.entries(defines)) {
		const segments = key.split(".");
		let target = globalThis as Record<string, unknown>;
		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			if (i === segments.length - 1) {
				target[segment] = value;
			} else {
				target = (target[segment] ??= {}) as Record<string, unknown>;
			}
		}
	}
}

// `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__` is a singleton and "colo local" ephemeral object. Refer to:
// https://github.com/cloudflare/workerd/blob/v1.20231206.0/src/workerd/server/workerd.capnp#L529-L543
export class __VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__
	implements DurableObject
{
	executor: VitestExecutorType | undefined;

	constructor(_state: DurableObjectState, env: Record<string, unknown> & Env) {
		vm._setUnsafeEval(env.__VITEST_POOL_WORKERS_UNSAFE_EVAL);
		ensurePatchedFunction(env.__VITEST_POOL_WORKERS_UNSAFE_EVAL);
		setEnv(env);
		applyDefines();
	}

	async handleVitestRunRequest(request: Request): Promise<Response> {
		assert.strictEqual(request.headers.get("Upgrade"), "websocket");
		const { 0: poolSocket, 1: poolResponseSocket } = new WebSocketPair();

		const workerDataHeader = request.headers.get("MF-Vitest-Worker-Data");
		assert(workerDataHeader !== null);
		const wd = structuredSerializableParse(workerDataHeader);
		assert(typeof wd === "object" && wd !== null);
		assert("filePath" in wd && typeof wd.filePath === "string");
		assert("name" in wd && typeof wd.name === "string");
		assert("data" in wd && typeof wd.data === "object" && wd.data !== null);
		assert("cwd" in wd && typeof wd.cwd === "string");
		cwd = wd.cwd;

		const port = new WebSocketMessagePort(poolSocket);
		try {
			const module = await import(wd.filePath);

			// HACK: Internally, Vitest's worker thread calls `startViteNode()`, which
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
					port.postMessage({ vitestPoolWorkersError: e });
					const error = reduceError(e);
					__console.error("Error running worker:", error.stack);
					poolSocket.close(1011, "Internal Error");
				});
		} catch (e) {
			const error = reduceError(e);
			__console.error("Error initialising worker:", error.stack);
			return Response.json(error, {
				status: 500,
				headers: { "MF-Experimental-Error-Stack": "true" },
			});
		}

		return new Response(null, { status: 101, webSocket: poolResponseSocket });
	}

	async fetch(request: Request): Promise<Response> {
		const response = await maybeHandleRunRequest(request, this);
		if (response !== undefined) {
			return response;
		}

		return this.handleVitestRunRequest(request);
	}
}

export default createWorkerEntrypointWrapper("default");

// Re-export user export wrappers
export * from "__VITEST_POOL_WORKERS_USER_OBJECT";
