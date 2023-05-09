import type {
	ExecutionContext,
	ServiceWorkerGlobalScope,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import { Awaitable, Miniflare, MiniflareOptions, Timers } from "@miniflare/tre";
import anyTest, { TestFn } from "ava";
import { getPort } from "./http";
import { TestLog } from "./log";

export type TestMiniflareHandler<Env> = (
	global: ServiceWorkerGlobalScope,
	request: WorkerRequest,
	env: Env,
	ctx: ExecutionContext
) => Awaitable<WorkerResponse>;

interface TestTimeout {
	triggerTimestamp: number;
	closure: () => Awaitable<unknown>;
}
export class TestTimers implements Timers<number> {
	#timestamp = 1_000_000; // 1000s
	#nextTimeoutHandle = 0;
	#pendingTimeouts = new Map<number, TestTimeout>();
	#runningTasks = new Set<Promise<unknown>>();

	get timestamp() {
		return this.#timestamp;
	}
	set timestamp(newValue: number) {
		this.#timestamp = newValue;
		for (const [handle, timeout] of this.#pendingTimeouts) {
			if (timeout.triggerTimestamp <= this.timestamp) {
				this.#pendingTimeouts.delete(handle);
				this.queueMicrotask(timeout.closure);
			}
		}
	}

	now = () => {
		return this.#timestamp;
	};

	setTimeout<Args extends any[]>(
		closure: (...args: Args) => Awaitable<unknown>,
		delay: number,
		...args: Args
	): number {
		const handle = this.#nextTimeoutHandle++;
		const argsClosure = () => closure(...args);
		if (delay === 0) {
			this.queueMicrotask(argsClosure);
		} else {
			const timeout: TestTimeout = {
				triggerTimestamp: this.timestamp + delay,
				closure: argsClosure,
			};
			this.#pendingTimeouts.set(handle, timeout);
		}
		return handle;
	}

	clearTimeout(handle: number) {
		this.#pendingTimeouts.delete(handle);
	}

	queueMicrotask(closure: () => Awaitable<unknown>) {
		const result = closure();
		if (result instanceof Promise) {
			this.#runningTasks.add(result);
			result.then(() => this.#runningTasks.delete(result));
		}
	}

	async waitForTasks() {
		await Promise.all(this.#runningTasks);
	}
}

export interface MiniflareTestContext {
	mf: Miniflare;
	url: URL;

	// Warning: if mutating or calling any of the following, `test.serial` must be
	// used to prevent races.
	log: TestLog;
	timers: TestTimers;
	setOptions(opts: Partial<MiniflareOptions>): Promise<void>;
}

export function miniflareTest<
	Env,
	Context extends MiniflareTestContext = MiniflareTestContext,
>(
	userOpts: Partial<MiniflareOptions>,
	handler?: TestMiniflareHandler<Env>
): TestFn<Context> {
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

	const test = anyTest as TestFn<Context>;
	test.before(async (t) => {
		const log = new TestLog(t);
		const timers = new TestTimers();

		const opts: Partial<MiniflareOptions> = {
			...scriptOpts,
			port: await getPort(),
			log,
			timers,
			verbose: true,
		};

		// `as MiniflareOptions` required as we're not enforcing that a script is
		// provided between `userOpts` and `opts`. We assume if it's not in
		// `userOpts`, a `handler` has been provided.
		t.context.mf = new Miniflare({ ...userOpts, ...opts } as MiniflareOptions);
		t.context.log = log;
		t.context.timers = timers;
		t.context.setOptions = (userOpts) =>
			t.context.mf.setOptions({ ...userOpts, ...opts } as MiniflareOptions);
		t.context.url = await t.context.mf.ready;
	});
	test.after((t) => t.context.mf.dispose());
	return test;
}
