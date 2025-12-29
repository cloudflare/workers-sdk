import { Awaitable, Miniflare, MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, onTestFinished } from "vitest";
import { TestLog } from "./log";
import type {
	ExecutionContext,
	ServiceWorkerGlobalScope,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";

const isWindows = process.platform === "win32";

/**
 * Dispose a Miniflare instance with retry logic for Windows EPERM errors.
 * On Windows, browser profile directories may not be fully released when
 * Chrome exits, causing EPERM/EBUSY errors during cleanup.
 *
 * This function is idempotent - calling it on an already-disposed instance
 * is treated as success (no error thrown).
 */
export async function disposeWithRetry(
	mf: Miniflare,
	maxRetries = 5,
	initialDelayMs = 100
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			await mf.dispose();
			return;
		} catch (e) {
			lastError = e;
			// Treat "already disposed" as success (idempotent disposal)
			const message = (e as Error).message;
			if (message === "Server is not running.") {
				return;
			}
			// Only retry on Windows-specific file locking errors
			const code = (e as NodeJS.ErrnoException).code;
			if (
				isWindows &&
				(code === "EPERM" || code === "EBUSY" || code === "ENOTEMPTY")
			) {
				const delay = initialDelayMs * Math.pow(2, attempt);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}
			// For non-Windows or non-retryable errors, throw immediately
			throw e;
		}
	}
	// If we exhausted all retries, throw the last error
	throw lastError;
}

/**
 * Register cleanup for a Miniflare instance with retry logic for Windows.
 * Use this instead of `onTestFinished(() => mf.dispose())` for all tests.
 */
export function useDispose(mf: Miniflare): void {
	onTestFinished(() => disposeWithRetry(mf));
}

export type TestMiniflareHandler<Env> = (
	global: ServiceWorkerGlobalScope,
	request: WorkerRequest,
	env: Env,
	ctx: ExecutionContext
) => Awaitable<WorkerResponse>;

export interface MiniflareTestContext {
	mf: Miniflare;
	url: URL;
	log: TestLog;
	setOptions(opts: Partial<MiniflareOptions>): Promise<void>;
}

export type Namespaced<T> = T & { ns: string };
// Automatically prefix all keys with the specified namespace, assuming keys
// are always specified as the first parameter (true for `KVNamespace`s and
// `R2Bucket`s)
export function namespace<T>(ns: string, binding: T): Namespaced<T> {
	return new Proxy(binding as Namespaced<T>, {
		get(target, key, receiver) {
			if (key === "ns") return ns;
			const value = Reflect.get(target, key, receiver);
			if (typeof value === "function" && key !== "list") {
				return (keys: unknown, ...args: unknown[]) => {
					if (typeof keys === "string") keys = ns + keys;
					if (Array.isArray(keys)) keys = keys.map((key) => ns + key);
					const result = (value as (...args: unknown[]) => unknown)(
						keys,
						...args
					);
					if (result instanceof Promise) {
						return result.then((res) => {
							// KV.get([a,b,c]) would be prefixed with ns, so we strip this prefix from response.
							// Map keys => [{ns}{a}, {ns}{b}, {ns}{b}] -> [a,b,c]
							if (res instanceof Map) {
								const newResult = new Map<string, unknown>();
								for (const [key, value] of res) {
									newResult.set(key.slice(ns.length), value);
								}
								return newResult;
							}
							return res;
						});
					}
					return result;
				};
			}
			return value;
		},
		set(target, key, newValue, receiver) {
			if (key === "ns") {
				ns = newValue;
				return true;
			} else {
				return Reflect.set(target, key, newValue, receiver);
			}
		},
	});
}

export function miniflareTest<Env, Context extends MiniflareTestContext>(
	userOpts: Partial<MiniflareOptions>,
	handler?: TestMiniflareHandler<Env>
): Context {
	let scriptOpts: MiniflareOptions | undefined;
	if (handler !== undefined) {
		const script = `
      const handler = (${handler.toString()});
      function reduceError(e) {
        return {
          name: e?.name,
          message: e?.message ?? String(e),
          stack: e?.stack,
          cause: e?.cause === undefined ? undefined : reduceError(e.cause),
        };
      }
      export default {
        async fetch(request, env, ctx) {
          try {
            return await handler(globalThis, request, env, ctx);
          } catch (e) {
            const error = reduceError(e);
            return Response.json(error, {
              status: 500,
              headers: { "MF-Experimental-Error-Stack": "true" },
            });
          }
        }
      }
    `;
		scriptOpts = {
			modules: [{ type: "ESModule", path: "index.mjs", contents: script }],
		};
	}

	const log = new TestLog();

	const opts: Partial<MiniflareOptions> = {
		...scriptOpts,
		log,
		verbose: true,
	};

	const context = {
		mf: null as unknown as Miniflare,
		url: null as unknown as URL,
		log,
		setOptions: async (newUserOpts: Partial<MiniflareOptions>) => {
			await context.mf.setOptions({
				...newUserOpts,
				...opts,
			} as MiniflareOptions);
		},
	} as Context;

	beforeAll(async () => {
		// `as MiniflareOptions` required as we're not enforcing that a script is
		// provided between `userOpts` and `opts`. We assume if it's not in
		// `userOpts`, a `handler` has been provided.
		context.mf = new Miniflare({ ...userOpts, ...opts } as MiniflareOptions);
		context.url = await context.mf.ready;
	});

	afterAll(() => disposeWithRetry(context.mf));

	return context;
}
