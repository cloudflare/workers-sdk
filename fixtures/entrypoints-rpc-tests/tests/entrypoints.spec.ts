import fs, { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { Agent, fetch, setGlobalDispatcher } from "undici";
import { test as baseTest, describe, expect, onTestFinished, vi } from "vitest";
import {
	runWranglerDev,
	runWranglerPagesDev,
} from "../../shared/src/run-wrangler-long-lived";

const timeoutAgent = new Agent({
	connectTimeout: 500,
	bodyTimeout: 500,
	headersTimeout: 500,
});
setGlobalDispatcher(timeoutAgent);

const tmpPathBase = path.join(os.tmpdir(), "wrangler-tests");

type WranglerDevSession = Awaited<ReturnType<typeof runWranglerDev>>;
type StartDevSession = (
	files: Record<string, string>,
	flags?: string[],
	pagesPublicPath?: string
) => Promise<{ url: URL; session: WranglerDevSession }>;

export async function seed(root: string, files: Record<string, string>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, contents);
	}
}

function waitFor<T>(callback: Parameters<typeof vi.waitFor<T>>[0]) {
	// The default timeout of `vi.waitFor()` is only 1s, which is a little
	// short for some of these tests, especially on Windows.
	return vi.waitFor(callback, { timeout: 5_000, interval: 250 });
}

const test = baseTest.extend<{
	tmpPath: string;
	isolatedDevRegistryPath: string;
	dev: StartDevSession;
}>({
	// Fixture for creating a temporary directory
	async tmpPath({}, use) {
		const tmpPath = await fs.realpath(await fs.mkdtemp(tmpPathBase));
		await use(tmpPath);
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
	},
	// Fixture for starting an isolated dev registry server on a random port
	async isolatedDevRegistryPath({}, use) {
		const tmpPath = await fs.realpath(await fs.mkdtemp(tmpPathBase));
		await use(tmpPath);
		await fs.rm(tmpPath, { recursive: true, maxRetries: 10 });
	},
	// Fixture for starting a worker in a temporary directory, using the test's
	// isolated dev registry
	async dev({ tmpPath, isolatedDevRegistryPath }, use) {
		const workerTmpPathBase = path.join(tmpPath, "worker-");
		const cleanups: (() => Promise<unknown>)[] = [];

		const fn: StartDevSession = async (files, flags, pagesPublicPath) => {
			const workerPath = await fs.mkdtemp(workerTmpPathBase);
			await seed(workerPath, files);

			let session: WranglerDevSession;
			if (pagesPublicPath !== undefined) {
				session = await runWranglerPagesDev(
					workerPath,
					pagesPublicPath,
					["--port=0", "--inspector-port=0", ...(flags ?? [])],
					{ WRANGLER_REGISTRY_PATH: String(isolatedDevRegistryPath) }
				);
			} else {
				session = await runWranglerDev(
					workerPath,
					["--port=0", "--inspector-port=0", ...(flags ?? [])],
					{ WRANGLER_REGISTRY_PATH: String(isolatedDevRegistryPath) }
				);
			}

			cleanups.push(session.stop);
			// noinspection HttpUrlsUsage
			const url = new URL(`http://${session.ip}:${session.port}`);
			return { url, session };
		};

		await use(fn);

		await Promise.allSettled(cleanups.map((fn) => fn()));
	},
});
describe("entrypoints", () => {
	test("should support binding to the same worker", async ({ dev }) => {
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "entry"
		`,
			"index.ts": dedent`
			export default {
				fetch(request, env, ctx) {
					const { pathname } = new URL(request.url);

					if (pathname === "/loopback") {
						return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
					}

					return env.SERVICE.fetch("https://placeholder:9999/loopback", {
						method: "POST",
						cf: { thing: true },
					});
				}
			}
		`,
		});

		const response = await fetch(url);
		// Check protocol, host, and cf preserved
		expect(await response.text()).toBe(
			'POST https://placeholder:9999/loopback {"thing":true}'
		);
	});

	test("should support default ExportedHandler entrypoints", async ({
		dev,
	}) => {
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			export default {
				fetch(request, env, ctx) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
			};
		`,
		});

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
		`,
			"index.ts": dedent`
			export default {
				fetch(request, env, ctx) {
					return env.SERVICE.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
				}
			}
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			// Check protocol, host, and cf preserved
			expect(text).toBe('POST https://placeholder:9999/ {"thing":true}');
		});
	});

	test("should support default WorkerEntrypoint entrypoints", async ({
		dev,
	}) => {
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			// Check middleware is transparent to RPC
			export default class ThingEntrypoint extends WorkerEntrypoint {
				fetch(request) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
				ping() {
					return "pong";
				}
			};
		`,
		});

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const response = await env.SERVICE.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
					const text = await response.text();
					const pong = await env.SERVICE.ping();
					return new Response(\`\${text} \${pong}\`);
				}
			}
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			// Check protocol, host, and cf preserved
			expect(text).toBe('POST https://placeholder:9999/ {"thing":true} pong');
		});
	});

	test("should support middleware with default WorkerEntrypoint entrypoints", async ({
		dev,
	}) => {
		const files: Record<string, string> = {
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "entry"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			let lastController;
			export default class TestEntrypoint extends WorkerEntrypoint {
				fetch(request) {
					const { pathname } = new URL(request.url);
					if (pathname === "/throw") throw new Error("Oops!");
					if (pathname === "/controller") return new Response(lastController.cron);
					return new Response(\`\${request.method} \${new URL(request.url).pathname}\`);
				}
				scheduled(controller) {
					lastController = controller;
				}
			}
		`,
		};
		const { url } = await dev(files, ["--test-scheduled"]);

		let response = await fetch(url);
		expect(await response.text()).toBe("GET /");

		// Check other events can be dispatched
		response = await fetch(new URL("/__scheduled?cron=* * * * 30", url));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("Ran scheduled event");
		response = await fetch(new URL("/controller", url));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("* * * * 30");

		// Check multiple middleware can be registered
		response = await fetch(new URL("/throw", url));
		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toMatch(/text\/html/);
		expect(await response.text()).toMatch("Oops!");
	});

	test("should support named ExportedHandler entrypoints to itself", async ({
		dev,
	}) => {
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "entry"
			entrypoint = "ThingEntrypoint"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class ThingEntrypoint extends WorkerEntrypoint {
				fetch(request) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
				ping() {
					return "pong";
				}
			};
			export default {
				fetch(request, env, ctx) {
					return env.SERVICE.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
				}
			}
		`,
		});

		const response = await fetch(url);
		// Check protocol, host, and cf preserved
		expect(await response.text()).toBe(
			'POST https://placeholder:9999/ {"thing":true}'
		);
	});

	test("should support named ExportedHandler entrypoints", async ({ dev }) => {
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			export const thing = {
				fetch(request, env, ctx) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
			entrypoint = "thing"
		`,
			"index.ts": dedent`
			export default {
				fetch(request, env, ctx) {
					return env.SERVICE.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
				}
			}
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			// Check protocol, host, and cf preserved
			expect(text).toBe('POST https://placeholder:9999/ {"thing":true}');
		});
	});

	test("should support named WorkerEntrypoint entrypoints", async ({ dev }) => {
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class ThingEntrypoint extends WorkerEntrypoint {
				fetch(request) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
				ping() {
					return "pong";
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
			entrypoint = "ThingEntrypoint"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const response = await env.SERVICE.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
					const text = await response.text();
					const pong = await env.SERVICE.ping();
					return new Response(\`\${text} \${pong}\`);
				}
			}
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			// Check protocol, host, and cf preserved
			expect(text).toBe('POST https://placeholder:9999/ {"thing":true} pong');
		});
	});

	test("should support named entrypoints in pages dev", async ({ dev }) => {
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class ThingEntrypoint extends WorkerEntrypoint {
				ping() {
					return "pong";
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		const files = {
			"functions/index.ts": dedent`
			export const onRequest = async ({ env }) => {
				return new Response(await env.SERVICE.ping());
			};
		`,
		};
		const { url } = await dev(
			files,
			["--service=SERVICE=bound#ThingEntrypoint"],
			/* pagesPublicPath */ "dist"
		);

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			expect(text).toBe("pong");
		});
	});

	test("should support co-dependent services", async ({ dev }) => {
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "a"
			main = "index.ts"

			[[services]]
			binding = "SERVICE_B"
			service = "b"
			entrypoint = "BEntrypoint"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class AEntrypoint extends WorkerEntrypoint {
				ping() {
					return "a:pong";
				}
			};
			export default {
				async fetch(request, env, ctx) {
					return new Response(await env.SERVICE_B.ping());
				}
			};
		`,
		});

		await dev({
			"wrangler.toml": dedent`
			name = "b"
			main = "index.ts"

			[[services]]
			binding = "SERVICE_A"
			service = "a"
			entrypoint = "AEntrypoint"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class BEntrypoint extends WorkerEntrypoint {
				async ping() {
					const result = await this.env.SERVICE_A.ping();
					return \`b:\${result}\`;
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			expect(text).toBe("b:a:pong");
		});
	});

	test("should support binding to Durable Object in another worker", async ({
		dev,
	}) => {
		// RPC isn't supported in this case yet :(

		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"

			[durable_objects]
			bindings = [
			  { name = "OBJECT", class_name = "ThingObject" }
			]
		`,
			"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class ThingObject extends DurableObject {
				fetch(request) {
					return new Response(\`\${request.method} \${request.url} \${JSON.stringify(request.cf)}\`);
				}
				get property() {
					return "property:ping";
				}
				method() {
					return "method:ping";
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[durable_objects]
			bindings = [
			  { name = "OBJECT", class_name = "ThingObject", script_name = "bound" }
			]
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const id = env.OBJECT.newUniqueId();
					const stub = env.OBJECT.get(id);

					const { pathname } = new URL(request.url);
					if (pathname === "/rpc") {
						const errors = [];
						try { await stub.property; } catch (e) { errors.push(e); }
						try { await stub.method(); } catch (e) { errors.push(e); }
						return Response.json(errors.map(String));
					}

					return stub.fetch("https://placeholder:9999/", {
						method: "POST",
						cf: { thing: true },
					});
				}
			}
		`,
		});

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			// Check protocol, host, and cf preserved
			expect(text).toBe('POST https://placeholder:9999/ {"thing":true}');
		});

		const rpcResponse = await fetch(new URL("/rpc", url));
		const errors = await rpcResponse.json();
		expect(errors).toMatchInlineSnapshot(`
			[
			  "Error: Cannot access "ThingObject#property" as Durable Object RPC is not yet supported between multiple dev sessions.",
			  "Error: Cannot access "ThingObject#method" as Durable Object RPC is not yet supported between multiple dev sessions.",
			]
		`);
	});

	test("should support binding to Durable Object in same worker", async ({
		dev,
	}) => {
		// RPC is supported here though :)

		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[durable_objects]
			bindings = [
			  { name = "OBJECT", class_name = "ThingObject" }
			]
		`,
			"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class ThingObject extends DurableObject {
				ping() {
					return "pong";
				}
			};
			export default {
				async fetch(request, env, ctx) {
					const id = env.OBJECT.newUniqueId();
					const stub = env.OBJECT.get(id);
					return new Response(await stub.ping());
				}
			}
		`,
		});

		const response = await fetch(url);
		expect(await response.text()).toBe("pong");
	});

	test("should support binding to Durable Object in same worker with explicit script_name", async ({
		dev,
	}) => {
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[durable_objects]
			bindings = [
			  { name = "OBJECT", class_name = "ThingObject", script_name = "entry" }
			]
		`,
			"index.ts": dedent`
			import { DurableObject } from "cloudflare:workers";
			export class ThingObject extends DurableObject {
				ping() {
					return "pong";
				}
			};
			export default {
				async fetch(request, env, ctx) {
					const id = env.OBJECT.newUniqueId();
					const stub = env.OBJECT.get(id);
					return new Response(await stub.ping());
				}
			}
		`,
		});

		const response = await fetch(url);
		expect(await response.text()).toBe("pong");
	});

	test("should throw if binding to named entrypoint exported by version of wrangler without entrypoints support", async ({
		dev,
		isolatedDevRegistryPath,
	}) => {
		// Start entry worker first, so the server starts with a stubbed service not
		// found binding
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
			entrypoint = "ThingEntrypoint"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return env.SERVICE.fetch("https://placeholder:9999/");
				}
			}
		`,
		});
		let response = await fetch(url);
		expect(response.status).toBe(503);
		expect(await response.text()).toBe(
			'Couldn\'t find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to'
		);

		await writeFile(
			path.join(isolatedDevRegistryPath, "bound"),
			JSON.stringify({
				protocol: "http",
				mode: "local",
				port: 0,
				host: "localhost",
				durableObjects: [],
				durableObjectsHost: "localhost",
				durableObjectsPort: 0,
				// Intentionally omitting `entrypointAddresses`
			})
		);

		await waitFor(async () => {
			let response = await fetch(url);
			expect(response.status).toBe(503);
			expect(await response.text()).toBe(
				'Couldn\'t find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to'
			);
		});
	});

	test("should throw if wrangler session doesn't export expected entrypoint", async ({
		dev,
	}) => {
		// Start entry worker first, so the server starts with a stubbed service not
		// found binding
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
			entrypoint = "ThingEntrypoint"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return env.SERVICE.fetch("https://placeholder:9999/");
				}
			}
		`,
		});
		let response = await fetch(url);
		expect(await response.text()).toBe(
			'Couldn\'t find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to'
		);

		// Start up the bound worker without the expected entrypoint
		await dev({
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class BadEntrypoint extends WorkerEntrypoint {
				fetch(request) {
					return new Response("bad");
				}
			};
			export default {}; // Required to treat as modules format worker
		`,
		});

		// Wait for error to be thrown
		await waitFor(async () => {
			let response = await fetch(url);
			expect(await response.text()).toBe(
				'Couldn\'t find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to'
			);
		});
	});

	test("should support binding to wrangler session listening on HTTPS", async ({
		dev,
	}) => {
		// Start entry worker first, so the server starts with a stubbed service not
		// found binding
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return env.SERVICE.fetch("http://placeholder/");
				}
			}
		`,
		});
		let response = await fetch(url);
		expect(await response.text()).toBe(
			'Couldn\'t find a local dev session for the "default" entrypoint of service "bound" to proxy to'
		);

		// Start up the bound worker using HTTPS
		const files: Record<string, string> = {
			"wrangler.toml": dedent`
			name = "bound"
			main = "index.ts"
		`,
			"index.ts": dedent`
			export default {
				fetch() {
					return new Response("secure");
				}
			};
		`,
		};
		await dev(files, ["--local-protocol=https"]);

		await waitFor(async () => {
			const response = await fetch(url);
			const text = await response.text();
			expect(text).toBe("secure");
		});
	});

	test("should support binding to version of wrangler without entrypoints support over HTTPS", async ({
		dev,
		isolatedDevRegistryPath,
	}) => {
		// Start entry worker first, so the server starts with a stubbed service not
		// found binding
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"
			[[services]]
			binding = "SERVICE"
			service = "bound"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return env.SERVICE.fetch('http://placeholder/');
				}
			}
		`,
		});
		let response = await fetch(url);
		expect(await response.text()).toBe(
			'Couldn\'t find a local dev session for the "default" entrypoint of service "bound" to proxy to'
		);

		const boundWorker = new Miniflare({
			name: "bound",
			unsafeDevRegistryPath: isolatedDevRegistryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			https: true,
			script: `
				export default {
					async fetch(request, env, ctx) {
						return new Response("Hello from bound!");
					}
				}
			`,
			// No direct sockets so that no entrypointAddresses will be registered
		});
		onTestFinished(() => boundWorker.dispose());

		await boundWorker.ready;
		await waitFor(async () => {
			let response = await fetch(url);
			expect(await response.text()).toBe("Hello from bound!");
		});
	});

	test("should throw if performing RPC with session that hasn't started", async ({
		dev,
	}) => {
		const { url } = await dev({
			"wrangler.toml": dedent`
			name = "entry"
			main = "index.ts"

			[[services]]
			binding = "SERVICE"
			service = "bound"
			entrypoint = "ThingEntrypoint"
		`,
			"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					const errors = [];
					try { await env.SERVICE.property; } catch (e) { errors.push(e); }
					try { await env.SERVICE.method(); } catch (e) { errors.push(e); }
					return Response.json(errors.map(String));
				}
			}
		`,
		});

		const response = await fetch(url);
		const errors = await response.json();
		expect(errors).toMatchInlineSnapshot(`
			[
			  "Error: Cannot access "property" as we couldn't find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to.",
			  "Error: Cannot access "method" as we couldn't find a local dev session for the "ThingEntrypoint" entrypoint of service "bound" to proxy to.",
			]
		`);
	});
});
