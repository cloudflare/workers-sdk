import { DurableObject } from "cloudflare:workers";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		switch (url.pathname) {
			// KV routes
			case "/kv/get": {
				const keyToGet = url.searchParams.get("key") ?? "default";
				const value = await env.KV.get(keyToGet);
				return new Response(value || "null");
			}
			case "/kv/put": {
				const keyToSet = url.searchParams.get("key") ?? "default";
				const val = url.searchParams.get("value");
				await env.KV.put(keyToSet, val);
				return new Response("OK");
			}

			// D1 database route
			case "/d1": {
				await env.DB.exec(`
					DROP TABLE IF EXISTS users;
					CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
					INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');
				`);
				return new Response("OK");
			}
			// Durable Object SQLite routes
			case "/do": {
				const id = url.searchParams.get("id") || "default";
				const doId = env.DO.idFromName(id);
				const stub = env.DO.get(doId);
				return stub.fetch(request);
			}
		}
		return new Response("Hello World!");
	},
};

export class MyDurableObject extends DurableObject<Env> {
	async fetch(_request: Request): Promise<Response> {
		this.ctx.storage.sql.exec(`
			DROP TABLE IF EXISTS users;
			CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
			INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob');
		`);
		return new Response("OK");
	}
}
