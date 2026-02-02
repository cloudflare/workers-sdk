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
			case "/kv/delete": {
				const keyToDelete = url.searchParams.get("key") ?? "default";
				await env.KV.delete(keyToDelete);
				return new Response(`Deleted key ${keyToDelete} from KV`);
			}
			case "/kv/seed": {
				await Promise.all(SEED_DATA.map(([k, v]) => env.KV.put(k, v)));
				return new Response(`Seeded ${SEED_DATA.length} KV entries`);
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
const SEED_DATA: [string, string][] = [
	["greeting", "Hello, World!"],
	["counter", "42"],
	["config:theme", "dark"],
	["config:language", "en-US"],
	["config:timezone", "America/New_York"],
	["config:debug", "false"],
	["config:max-retries", "3"],
	["feature:dark-mode", "enabled"],
	["feature:beta-ui", "disabled"],
	["feature:notifications", "enabled"],
	["api:rate-limit", "1000"],
	["api:timeout-ms", "30000"],
	["api:base-url", "https://api.example.com/v1"],
	[
		"user:1",
		JSON.stringify({
			id: 1,
			name: "Alice",
			email: "alice@example.com",
			role: "admin",
		}),
	],
	[
		"user:2",
		JSON.stringify({
			id: 2,
			name: "Bob",
			email: "bob@example.com",
			role: "user",
		}),
	],
	[
		"user:3",
		JSON.stringify({
			id: 3,
			name: "Charlie",
			email: "charlie@example.com",
			role: "user",
		}),
	],
	[
		"user:4",
		JSON.stringify({
			id: 4,
			name: "Diana",
			email: "diana@example.com",
			role: "moderator",
		}),
	],
	[
		"user:5",
		JSON.stringify({
			id: 5,
			name: "Eve",
			email: "eve@example.com",
			role: "user",
		}),
	],
	[
		"session:abc123",
		JSON.stringify({ userId: 1, expiresAt: "2025-12-31T23:59:59Z" }),
	],
	[
		"session:def456",
		JSON.stringify({ userId: 2, expiresAt: "2025-06-15T12:00:00Z" }),
	],
	[
		"session:ghi789",
		JSON.stringify({ userId: 3, expiresAt: "2025-03-01T08:30:00Z" }),
	],
	["cache:homepage", "<html><body><h1>Welcome</h1></body></html>"],
	["cache:about", "<html><body><h1>About Us</h1></body></html>"],
	["cache:contact", "<html><body><h1>Contact</h1></body></html>"],
	[
		"product:1",
		JSON.stringify({ id: 1, name: "Widget", price: 9.99, stock: 150 }),
	],
	[
		"product:2",
		JSON.stringify({ id: 2, name: "Gadget", price: 24.99, stock: 75 }),
	],
	[
		"product:3",
		JSON.stringify({ id: 3, name: "Gizmo", price: 14.99, stock: 200 }),
	],
	[
		"product:4",
		JSON.stringify({ id: 4, name: "Thingamajig", price: 39.99, stock: 30 }),
	],
	[
		"product:5",
		JSON.stringify({ id: 5, name: "Doohickey", price: 19.99, stock: 100 }),
	],
	["stats:visits", "123456"],
	["stats:unique-users", "45678"],
	["stats:page-views", "987654"],
	["stats:bounce-rate", "0.35"],
	["stats:avg-session", "4m 32s"],
	[
		"log:error:1",
		JSON.stringify({
			level: "error",
			message: "Connection timeout",
			timestamp: "2025-01-15T10:30:00Z",
		}),
	],
	[
		"log:error:2",
		JSON.stringify({
			level: "error",
			message: "Invalid token",
			timestamp: "2025-01-15T11:45:00Z",
		}),
	],
	[
		"log:warn:1",
		JSON.stringify({
			level: "warn",
			message: "Rate limit approaching",
			timestamp: "2025-01-15T12:00:00Z",
		}),
	],
	["queue:pending", "15"],
	["queue:processing", "3"],
	["queue:completed", "1247"],
	["queue:failed", "12"],
	["special/key/with/slashes", "value with slashes in key"],
	["key with spaces", "value for spaced key"],
	["key.with.dots", "dotted key value"],
	["UPPERCASE_KEY", "uppercase key value"],
	["mixedCase_Key-123", "mixed case key value"],
	[
		"long-value-example",
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
	],
	["emoji-key-🔑", "value with emoji in key"],
	["empty-value", ""],
	["boolean-true", "true"],
	["boolean-false", "false"],
	["number-integer", "42"],
	["number-float", "3.14159"],
	["number-negative", "-273.15"],
];
