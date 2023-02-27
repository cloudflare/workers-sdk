import type {
	ExecutionContext,
	ServiceWorkerGlobalScope,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types/experimental";
import { Awaitable, Miniflare, MiniflareOptions } from "@miniflare/tre";
import anyTest, { TestFn } from "ava";
import { getPort } from "./http";
import { TestLog } from "./log";

export type TestMiniflareHandler<Env> = (
	global: ServiceWorkerGlobalScope,
	request: WorkerRequest,
	env: Env,
	ctx: ExecutionContext
) => Awaitable<WorkerResponse>;

export interface TestClock {
	timestamp: number;
}

type MiniflareOptionsWithoutScripts = Exclude<
	MiniflareOptions,
	"script" | "scriptPath" | "modules" | "modulesRoot"
>;

export interface MiniflareTestContext {
	mf: Miniflare;
	url: URL;

	// Warning: if mutating or calling any of the following, `test.serial` must be
	// used to prevent races.
	log: TestLog;
	clock: TestClock;
	setOptions(opts: MiniflareOptionsWithoutScripts): Promise<void>;
}

export function miniflareTest<
	Env,
	Context extends MiniflareTestContext = MiniflareTestContext,
>(
	userOpts: MiniflareOptionsWithoutScripts,
	handler?: TestMiniflareHandler<Env>
): TestFn<Context> {
	const scriptOpts: MiniflareOptions = {};
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
            return handler(globalThis, request, env, ctx);
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
		scriptOpts.modules = [
			{ type: "ESModule", path: "index.mjs", contents: script },
		];
	}

	const test = anyTest as TestFn<Context>;
	test.before(async (t) => {
		const log = new TestLog();
		const clock: TestClock = { timestamp: 1_000_000 }; // 1000s
		const clockFunction = () => clock.timestamp;

		const opts: MiniflareOptions = {
			port: await getPort(),
			log,
			clock: clockFunction,
			verbose: true,
			...scriptOpts,
		};

		t.context.mf = new Miniflare({ ...userOpts, ...opts });
		t.context.log = log;
		t.context.clock = clock;
		t.context.setOptions = (userOpts) =>
			t.context.mf.setOptions({ ...userOpts, ...opts });
		t.context.url = await t.context.mf.ready;
	});
	test.after((t) => t.context.mf.dispose());
	return test;
}
