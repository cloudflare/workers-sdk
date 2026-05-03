import { DurableObject } from "cloudflare:workers";

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		switch (url.pathname) {
			case "/kv/seed": {
				await env.KV_B.put("worker-b-key-1", "value from worker B");
				await env.KV_B.put("worker-b-key-2", "another value from worker B");
				return new Response("Seeded Worker B KV");
			}
			case "/d1/seed": {
				await env.DB_B.exec(`
					DROP TABLE IF EXISTS products;
					CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
					INSERT INTO products (id, name, price) VALUES
						(1, 'Widget', 9.99),
						(2, 'Gadget', 19.99),
						(3, 'Gizmo', 29.99);
				`);
				return new Response("Seeded Worker B D1");
			}
			case "/do/seed": {
				const doId = env.DO_B.idFromName("worker-b-do");
				const stub = env.DO_B.get(doId);
				return stub.fetch(request);
			}
		}
		return new Response("Hello from Worker B!");
	},
} satisfies ExportedHandler<Env>;

export class WorkerBDurableObject extends DurableObject<Env> {
	async fetch(_request: Request): Promise<Response> {
		this.ctx.storage.sql.exec(`
			DROP TABLE IF EXISTS orders;
			CREATE TABLE orders (id INTEGER PRIMARY KEY, product_id INTEGER, quantity INTEGER);
			INSERT INTO orders (id, product_id, quantity) VALUES
				(1, 1, 5),
				(2, 2, 3),
				(3, 3, 10);
		`);
		return new Response("Seeded Worker B Durable Object");
	}
}
