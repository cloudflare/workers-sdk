import { DurableObject, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import { Counter } from "./counter";

export class TestObject extends DurableObject<Env> {
	#value: number = 0;
	#log: string[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.overriddenPrototypeMethod = () => "instance";
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

	record(value: string) {
		this.#log.push(value);
	}

	getLog() {
		return this.#log;
	}

	async recordFromDurableObject(targetName: string, calls: number) {
		const id = this.env.TEST_OBJECT.idFromName(targetName);
		const stub = this.env.TEST_OBJECT.get(id);
		const promises: Promise<void>[] = [];

		for (let i = 0; i < calls; i++) {
			promises.push(stub.record(`call-${i}`));
		}

		await Promise.all(promises);
		return stub.getLog();
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

	overriddenPrototypeMethod() {
		return "prototype";
	}

	getCounter() {
		return new Counter(0);
	}

	getObject() {
		return { hello: "world" };
	}

	alarm() {
		this.#value = 0;
		void this.ctx.storage.put("count", this.#value);
	}

	instanceProperty = "👻";
}

export class ProxiedTestObject extends DurableObject<Env> {
	#value = "private value";

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		return new Proxy(this, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	}

	readPrivateValue() {
		return this.#value;
	}
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

	getCounter() {
		return new Counter(0);
	}

	async recordFromWorkerEntrypoint(targetName: string, calls: number) {
		const id = this.env.TEST_OBJECT.idFromName(targetName);
		const stub = this.env.TEST_OBJECT.get(id);
		const promises: Promise<void>[] = [];

		for (let i = 0; i < calls; i++) {
			promises.push(stub.record(`call-${i}`));
		}

		await Promise.all(promises);
		return stub.getLog();
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
