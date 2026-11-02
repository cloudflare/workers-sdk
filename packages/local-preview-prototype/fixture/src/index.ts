import { DurableObject, env, WorkerEntrypoint } from "cloudflare:workers";

type Env = {
	GREETING: string;
	NOTES: KVNamespace;
	DB: D1Database;
	COUNTER: DurableObjectNamespace<Counter>;
};

const bindings = env as Env;

export class Counter extends DurableObject {
	/** Not persisted, so it resets when the object is evicted. */
	memory = 0;

	constructor(ctx: DurableObjectState, workerEnv: unknown) {
		super(ctx, workerEnv);
		ctx.storage.sql.exec(
			"CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)"
		);
	}

	increment(): number {
		this.memory++;
		this.ctx.storage.sql.exec(
			"INSERT INTO counter (id, value) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET value = value + 1"
		);
		return this.ctx.storage.sql
			.exec<{ value: number }>("SELECT value FROM counter WHERE id = 1")
			.one().value;
	}

	getMemory(): number {
		return this.memory;
	}
}

export default class extends WorkerEntrypoint {
	async fetch(request: Request) {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/notes") {
			const { id, text } = await request.json<{ id: string; text: string }>();
			await bindings.NOTES.put(`note:${id}`, text);
			await bindings.DB.prepare("INSERT INTO notes (id, text) VALUES (?, ?)")
				.bind(id, text)
				.run();
			const count = await bindings.COUNTER.getByName("global").increment();
			return Response.json({ id, count }, { status: 201 });
		}

		const counter = url.pathname.match(/^\/counters\/([^/]+)$/);
		if (counter) {
			const stub = bindings.COUNTER.getByName(counter[1]);
			const count = await stub.increment();
			return Response.json({ memory: await stub.getMemory(), count });
		}

		const match = url.pathname.match(/^\/notes\/([^/]+)$/);
		if (request.method === "GET" && match) {
			const text = await bindings.NOTES.get(`note:${match[1]}`);
			return text === null
				? new Response("Not found", { status: 404 })
				: new Response(text);
		}

		return new Response(bindings.GREETING);
	}

	async scheduled(controller: ScheduledController) {
		console.log(`cron fired: ${controller.cron}`);
		await bindings.NOTES.put("last-cron", controller.cron);
	}

	/** An RPC method on the default export, reachable through `entrypoint`. */
	add(a: number, b: number): number {
		return a + b;
	}
}
