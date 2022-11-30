import {
	ExecutionContext,
	ServiceWorkerGlobalScope,
	Request as WorkerRequest,
	Response as WorkerResponse,
} from "@cloudflare/workers-types";
import {
	Awaitable,
	Log,
	LogLevel,
	Miniflare,
	MiniflareOptions,
} from "@miniflare/tre";
import anyTest, { TestFn } from "ava";
import { ModuleDefinition } from "../src/plugins/core/modules";

export type LogEntry = [level: LogLevel, message: string];
export class TestLog extends Log {
	logs: LogEntry[] = [];

	constructor() {
		super(LogLevel.VERBOSE);
	}

	log(message: string): void {
		this.logs.push([LogLevel.NONE, message]);
	}

	logWithLevel(level: LogLevel, message: string): void {
		this.logs.push([level, message]);
	}

	error(message: Error): void {
		throw message;
	}

	logsAtLevel(level: LogLevel): string[] {
		return this.logs
			.filter(([logLevel]) => logLevel === level)
			.map(([, message]) => message);
	}
}

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

interface MiniflareTestContext {
	mf: Miniflare;
	url: URL;

	// Warning: if mutating or calling any of the following, `test.serial` must be
	// used to prevent races.
	log: TestLog;
	clock: TestClock;
	setOptions(opts: MiniflareOptionsWithoutScripts): Promise<void>;
}
const test = anyTest as TestFn<MiniflareTestContext>;

export function miniflareTest<Env>(
	handler: TestMiniflareHandler<Env>,
	userOpts?: MiniflareOptionsWithoutScripts
): TestFn<MiniflareTestContext> {
	const script = `
    const handler = (${handler.toString()});
    export default {
      async fetch(request, env, ctx) {
        try {
          return handler(globalThis, request, env, ctx);
        } catch (e) {
          return new Response(e?.stack ?? String(e), { status: 500 });
        } 
      }
    }
  `;

	test.before(async (t) => {
		const log = new TestLog();
		const clock: TestClock = { timestamp: 1_000_000 }; // 1000s
		const clockFunction = () => clock.timestamp;

		const modules: ModuleDefinition[] = [
			{ type: "ESModule", path: "index.mjs", contents: script },
		];

		const opts: MiniflareOptions = {
			log,
			clock: clockFunction,
			verbose: true,
			modules,
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
