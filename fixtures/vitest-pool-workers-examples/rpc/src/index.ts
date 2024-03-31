import { DurableObject, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

export class Counter extends RpcTarget {
	#value: number;

	constructor(value: number) {
		super();
		this.#value = value;
	}

	get value() {
		return this.#value;
	}

	increment(by = 1) {
		return (this.#value += by);
	}

	clone() {
		return new Counter(this.#value);
	}
}

export class TestObject extends DurableObject<Env> {
	#value: number = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		void ctx.blockConcurrencyWhile(async () => {
			this.#value = (await ctx.storage.get("count")) ?? 0;
		});
	}

	get value() {
		return this.#value;
	}

	increment(by = 1) {
		this.#value += by;
		void this.ctx.storage.put("count", this.#value);
		return this.#value;
	}

	scheduleReset(afterMillis: number) {
		void this.ctx.storage.setAlarm(Date.now() + afterMillis);
	}

	async fetch(request: Request) {
		return Response.json({
			source: "TestObject",
			method: request.method,
			url: request.url,
			ctxWaitUntil: typeof this.ctx.waitUntil,
			envKeys: Object.keys(this.env).sort(),
		});
	}

	alarm() {
		this.#value = 0;
		void this.ctx.storage.put("count", this.#value);
	}

	instanceProperty = "👻";
}

export const testNamedHandler = <ExportedHandler<Env>>{
	fetch(request, env, ctx) {
		return Response.json({
			source: "testNamedHandler",
			method: request.method,
			url: request.url,
			ctxWaitUntil: typeof ctx.waitUntil,
			envKeys: Object.keys(env).sort(),
		});
	},
};

export class TestNamedEntrypoint extends WorkerEntrypoint<Env> {
	fetch(request: Request) {
		return Response.json({
			source: "TestNamedEntrypoint",
			method: request.method,
			url: request.url,
			ctxWaitUntil: typeof this.ctx.waitUntil,
			envKeys: Object.keys(this.env).sort(),
		});
	}

	ping() {
		return "pong";
	}
}

export class TestSuperEntrypoint extends WorkerEntrypoint<Env> {
	superMethod() {
		return "🦸";
	}
}

let lastController: ScheduledController | undefined;
export default class TestDefaultEntrypoint extends TestSuperEntrypoint {
	async fetch(request: Request) {
		return Response.json({
			source: "TestDefaultEntrypoint",
			method: request.method,
			url: request.url,
			ctxWaitUntil: typeof this.ctx.waitUntil,
			envKeys: Object.keys(this.env).sort(),
		});
	}

	async scheduled(controller: ScheduledController) {
		lastController = controller;
	}

	get lastControllerCron() {
		return lastController?.cron;
	}

	sum(...args: number[]) {
		return args.reduce((acc, value) => acc + value, 0);
	}

	backgroundWrite(key: string, value: string) {
		this.ctx.waitUntil(this.env.KV_NAMESPACE.put(key, value));
	}

	async read(key: string) {
		return this.env.KV_NAMESPACE.get(key);
	}

	createCounter(value = 0) {
		return new Counter(value);
	}

	instanceProperty = "👻";
	instanceMethod = () => "👻";
}
