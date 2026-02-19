import assert from "node:assert";
import { Buffer } from "node:buffer";
import events from "node:events";
import process from "node:process";
import * as vm from "node:vm";
import defines from "__VITEST_POOL_WORKERS_DEFINES";
import {
	createWorkerEntrypointWrapper,
	maybeHandleRunRequest,
	registerHandlerAndGlobalWaitUntil,
	runInRunnerObject,
} from "cloudflare:test-internal";
import { DurableObject } from "cloudflare:workers";
import * as devalue from "devalue";
// Using relative path here to ensure `esbuild` bundles it
import {
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "../../../miniflare/src/workers/core/devalue";

function structuredSerializableStringify(value: unknown): string {
	return devalue.stringify(value, structuredSerializableReducers);
}
function structuredSerializableParse(value: string): unknown {
	return devalue.parse(value, structuredSerializableRevivers);
}

globalThis.Buffer = Buffer; // Required by `vite-node/source-map`

// Mock Service Worker needs this — stub with no-op methods since workerd
// doesn't provide BroadcastChannel
globalThis.BroadcastChannel = class {
	constructor(public name: string) {}
	postMessage(_message: unknown) {}
	close() {}
	addEventListener(_type: string, _listener: unknown) {}
	removeEventListener(_type: string, _listener: unknown) {}
	onmessage: ((event: unknown) => void) | null = null;
	onmessageerror: ((event: unknown) => void) | null = null;
} as unknown as typeof BroadcastChannel;

globalThis.process = process; // Required by `vite-node`
process.argv = []; // Required by `@vitest/utils`
let cwd: string | undefined;
process.cwd = () => {
	assert(cwd !== undefined, "Expected cwd to be set");
	return cwd;
};
// Required by vitest/worker
// @ts-expect-error We don't actually implement `process.memoryUsage()`
process.memoryUsage = () => ({});
Object.setPrototypeOf(process, events.EventEmitter.prototype); // Required by `vitest`

// Vitest needs this
// @ts-expect-error Apparently this is read-only
process.versions = { node: "20.0.0" };

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
	const fromVitest =
		/\/node_modules\/(\.store\/)?vitest/.test(callerFileName ?? "") ||
		/\/packages\/vitest\/dist/.test(callerFileName ?? "");

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

// `__VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__` is a singleton
export class __VITEST_POOL_WORKERS_RUNNER_DURABLE_OBJECT__ extends DurableObject {
	constructor(_state: DurableObjectState, doEnv: Cloudflare.Env) {
		super(_state, doEnv);
		vm._setUnsafeEval(doEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL);
		ensurePatchedFunction(doEnv.__VITEST_POOL_WORKERS_UNSAFE_EVAL);
		applyDefines();
	}

	async handleVitestRunRequest(request: Request): Promise<Response> {
		assert.strictEqual(request.headers.get("Upgrade"), "websocket");
		const { 0: poolSocket, 1: poolResponseSocket } = new WebSocketPair();

		const workerDataHeader = request.headers.get("MF-Vitest-Worker-Data");
		assert(workerDataHeader);

		const wd = structuredSerializableParse(workerDataHeader);
		assert(
			wd && typeof wd === "object" && "cwd" in wd && typeof wd.cwd === "string"
		);

		cwd = wd.cwd;

		const { init, runBaseTests, setupEnvironment } = await import(
			"vitest/worker"
		);

		poolSocket.accept();

		init({
			post: (response) => {
				try {
					poolSocket.send(structuredSerializableStringify(response));
				} catch (error) {
					// If the user tried to perform a dynamic `import()` or `console.log()`
					// from inside a `export default { fetch() { ... } }` handler using `SELF`
					// or from inside their own Durable Object, Vitest will try to send an
					// RPC message from a non-`RunnerObject` I/O context. There's nothing we
					// can really do to prevent this: we want to run these things in different
					// I/O contexts with the behaviour this causes. We'd still like to send
					// the RPC message though, so if we detect this, we try resend the message
					// from the runner object.
					if (isDifferentIOContextError(error)) {
						const promise = runInRunnerObject(() => {
							poolSocket.send(structuredSerializableStringify(response));
						}).catch((e) => {
							__console.error(
								"Error sending to pool inside runner:",
								e,
								response
							);
						});
						registerHandlerAndGlobalWaitUntil(promise);
					} else {
						__console.error("Error sending to pool:", error, response);
					}
				}
			},
			on: (callback) => {
				poolSocket.addEventListener("message", (m) => {
					callback(structuredSerializableParse(m.data));
				});
			},
			runTests: (state, traces) => runBaseTests("run", state, traces),
			collectTests: (state, traces) => runBaseTests("collect", state, traces),
			setup: setupEnvironment,
		});

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
