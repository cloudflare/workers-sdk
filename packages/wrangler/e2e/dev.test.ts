import assert from "node:assert";
import { existsSync } from "node:fs";
import * as nodeNet from "node:net";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { retry } from "./helpers/retry";
import { seed as baseSeed, makeRoot } from "./helpers/setup";

it("can import URL from 'url' in node_compat mode", async () => {
	const helper = new WranglerE2ETestHelper();
	await helper.seed({
		"wrangler.toml": dedent`
				name = "worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				node_compat = true
		`,
		"src/index.ts": dedent`
				const { URL } = require('url');
				const { URL: nURL } = require('node:url');

				export default {
					fetch(request) {
						const url = new URL('postgresql://user:password@example.com:12345/dbname?sslmode=disable')
						const nUrl = new nURL('postgresql://user:password@example.com:12345/dbname?sslmode=disable')
						return new Response(url + nUrl)
					}
				}`,
	});
	const worker = helper.runLongLived(`wrangler dev`);

	const { url } = await worker.waitForReady();

	await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
		`"postgresql://user:password@example.com:12345/dbname?sslmode=disablepostgresql://user:password@example.com:12345/dbname?sslmode=disable"`
	);
});

describe.each([
	{ cmd: "wrangler dev" },
	{ cmd: "wrangler dev --remote" },
	{ cmd: "wrangler dev --x-dev-env" },
	{ cmd: "wrangler dev --remote --x-dev-env" },
])("basic js dev: $cmd", ({ cmd }) => {
	it(`can modify worker during ${cmd}`, async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
							name = "worker"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
							compatibility_flags = ["nodejs_compat"]

							[vars]
							KEY = "value"
					`,
			"src/index.ts": dedent`
							export default {
								fetch(request) {
									return new Response("Hello World!")
								}
							}`,
			"package.json": dedent`
							{
								"name": "worker",
								"version": "0.0.0",
								"private": true
							}
							`,
		});
		const worker = helper.runLongLived(cmd);

		const { url } = await worker.waitForReady();

		await expect(fetch(url).then((r) => r.text())).resolves.toMatchSnapshot();

		await helper.seed({
			"src/index.ts": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker! " + env.KEY)
							}
						}`,
		});

		await worker.waitForReload();

		await expect(fetchText(url)).resolves.toMatchSnapshot();
	});
});

describe.each([
	{ cmd: "wrangler dev" },
	{ cmd: "wrangler dev --remote" },
	{ cmd: "wrangler dev --x-dev-env" },
	{ cmd: "wrangler dev --remote --x-dev-env" },
])("basic python dev: $cmd", { timeout: 90_000 }, ({ cmd }) => {
	it(`can modify entrypoint during ${cmd}`, async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "index.py"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["python_workers"]
			`,
			"arithmetic.py": dedent`
					def mul(a,b):
						return a*b`,
			"index.py": dedent`
					from arithmetic import mul

					from js import Response
					def on_fetch(request):
						return Response.new(f"py hello world {mul(2,3)}")`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const worker = helper.runLongLived(cmd);

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toBe("py hello world 6");

		await helper.seed({
			"index.py": dedent`
					from js import Response
					def on_fetch(request):
						return Response.new('Updated Python Worker value')`,
		});

		await worker.waitForReload();

		// TODO(soon): work out why python workers need this retry before returning new content
		const { text } = await retry(
			(s) => s.status !== 200 || s.text === "py hello world 6",
			async () => {
				const r = await fetch(url);
				return { text: await r.text(), status: r.status };
			}
		);

		expect(text).toBe("Updated Python Worker value");
	});

	it(`can modify imports during ${cmd}`, async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "index.py"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["python_workers"]
			`,
			"arithmetic.py": dedent`
					def mul(a,b):
						return a*b`,
			"index.py": dedent`
					from arithmetic import mul

					from js import Response
					def on_fetch(request):
						return Response.new(f"py hello world {mul(2,3)}")`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const worker = helper.runLongLived(cmd);

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toBe("py hello world 6");

		await helper.seed({
			"arithmetic.py": dedent`
					def mul(a,b):
						return a+b`,
		});

		await worker.waitForReload();

		// TODO(soon): work out why python workers need this retry before returning new content
		const { text } = await retry(
			(s) => s.status !== 200 || s.text === "py hello world 6",
			async () => {
				const r = await fetch(url);
				return { text: await r.text(), status: r.status };
			}
		);

		expect(text).toBe("py hello world 5");
	});
});

describe.each([{ cmd: "wrangler dev" }, { cmd: "wrangler dev --x-dev-env" }])(
	"dev registry $cmd",
	({ cmd }) => {
		let a: string;
		let b: string;
		let helper: WranglerE2ETestHelper;

		beforeEach(async () => {
			helper = new WranglerE2ETestHelper();
			a = await makeRoot();
			await baseSeed(a, {
				"wrangler.toml": dedent`
					name = "a"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"

					[[services]]
					binding = "BEE"
					service = 'b'
			`,
				"src/index.ts": dedent/* javascript */ `
				export default {
					fetch(req, env) {
						return env.BEE.fetch(req);
					},
				};
				`,
				"package.json": dedent`
					{
						"name": "a",
						"version": "0.0.0",
						"private": true
					}
					`,
			});

			b = await makeRoot();
			await baseSeed(b, {
				"wrangler.toml": dedent`
					name = "b"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
			`,
				"src/index.ts": dedent/* javascript */ `
				export default{
					fetch() {
						return new Response("hello world");
					},
				};
			`,
				"package.json": dedent`
					{
						"name": "b",
						"version": "0.0.0",
						"private": true
					}
					`,
			});
		});

		it("can fetch b", async () => {
			const worker = helper.runLongLived(cmd, { cwd: b });

			const { url } = await worker.waitForReady();

			await expect(fetch(url).then((r) => r.text())).resolves.toBe(
				"hello world"
			);
		});

		it("can fetch b through a (start b, start a)", async () => {
			const workerB = helper.runLongLived(cmd, { cwd: b });
			// We don't need b's URL, but ensure that b starts up before a
			await workerB.waitForReady();

			const workerA = helper.runLongLived(cmd, { cwd: a });
			const { url } = await workerA.waitForReady();

			await workerA.waitForReload();
			// Give the dev registry some time to settle
			await setTimeout(500);

			await expect(fetchText(url)).resolves.toBe("hello world");
		});

		it("can fetch b through a (start a, start b)", async () => {
			const workerA = helper.runLongLived(cmd, { cwd: a });
			const { url } = await workerA.waitForReady();

			const workerB = helper.runLongLived(cmd, { cwd: b });
			await workerB.waitForReady();

			await workerA.waitForReload();
			// Give the dev registry some time to settle
			await setTimeout(500);

			await expect(fetchText(url)).resolves.toBe("hello world");
		});
	}
);

describe("hyperdrive dev tests", () => {
	let server: nodeNet.Server;

	beforeEach(async () => {
		server = nodeNet.createServer().listen();
	});

	it("matches expected configuration parameters", async () => {
		const helper = new WranglerE2ETestHelper();
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "src/index.ts"
					compatibility_date = "2023-10-25"

					[[hyperdrive]]
					binding = "HYPERDRIVE"
					id = "hyperdrive_id"
					localConnectionString = "postgresql://user:%21pass@127.0.0.1:${port}/some_db"
			`,
			"src/index.ts": dedent`
					export default {
						async fetch(request, env) {
							if (request.url.includes("connect")) {
								const conn = env.HYPERDRIVE.connect();
								await conn.writable.getWriter().write(new TextEncoder().encode("test string"));
							}
							return new Response(env.HYPERDRIVE?.connectionString ?? "no")
						}
					}`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const worker = helper.runLongLived("wrangler dev");
		const { url } = await worker.waitForReady();

		const text = await fetchText(url);

		const hyperdrive = new URL(text);
		expect(hyperdrive.pathname).toBe("/some_db");
		expect(hyperdrive.username).toBe("user");
		expect(hyperdrive.password).toBe("!pass");
		expect(hyperdrive.host).not.toBe("localhost");
	});

	it("connects to a socket", async () => {
		const helper = new WranglerE2ETestHelper();
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "src/index.ts"
					compatibility_date = "2023-10-25"

					[[hyperdrive]]
					binding = "HYPERDRIVE"
					id = "hyperdrive_id"
					localConnectionString = "postgresql://user:pass@127.0.0.1:${port}/some_db"
			`,
			"src/index.ts": dedent`
					export default {
						async fetch(request, env) {
							if (request.url.includes("connect")) {
								const conn = env.HYPERDRIVE.connect();
								await conn.writable.getWriter().write(new TextEncoder().encode("test string"));
							}
							return new Response(env.HYPERDRIVE?.connectionString ?? "no")
						}
					}`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const socketMsgPromise = new Promise((resolve, _) => {
			server.on("connection", (sock) => {
				sock.on("data", (data) => {
					expect(new TextDecoder().decode(data)).toBe("test string");
					server.close();
					resolve({});
				});
			});
		});

		const worker = helper.runLongLived("wrangler dev");

		const { url } = await worker.waitForReady();

		await fetch(`${url}/connect`);

		await socketMsgPromise;
	});

	it("uses HYPERDRIVE_LOCAL_CONNECTION_STRING for the localConnectionString variable in the binding", async () => {
		const helper = new WranglerE2ETestHelper();
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "src/index.ts"
					compatibility_date = "2023-10-25"

					[[hyperdrive]]
					binding = "HYPERDRIVE"
					id = "hyperdrive_id"
			`,
			"src/index.ts": dedent`
					export default {
						async fetch(request, env) {
							if (request.url.includes("connect")) {
								const conn = env.HYPERDRIVE.connect();
								await conn.writable.getWriter().write(new TextEncoder().encode("test string"));
							}
							return new Response(env.HYPERDRIVE?.connectionString ?? "no")
						}
					}`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});

		const worker = helper.runLongLived("wrangler dev", {
			env: {
				...process.env,
				WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: `postgresql://user:pass@127.0.0.1:${port}/some_db`,
			},
		});

		const { url } = await worker.waitForReady();
		const socketMsgPromise = new Promise((resolve, _) => {
			server.on("connection", (sock) => {
				sock.on("data", (data) => {
					expect(new TextDecoder().decode(data)).toBe("test string");
					server.close();
					resolve({});
				});
			});
		});
		await fetch(`${url}/connect`);

		await socketMsgPromise;
	});

	afterEach(() => {
		if (server.listening) {
			server.close();
		}
	});
});

describe("queue dev tests", () => {
	it("matches expected configuration parameters", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
					name = "worker"
					main = "src/index.ts"
					compatibility_date = "2024-04-04"

					[[queues.producers]]
					binding = "QUEUE"
					queue = "test-queue"
					delivery_delay = 2
			`,
			"src/index.ts": dedent`
					export default {
						async fetch(request, env) {
							env.QUEUE.send();
							return new Response('sent');
						}
					}`,
			"package.json": dedent`
					{
						"name": "worker",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const worker = helper.runLongLived("wrangler dev");
		const { url } = await worker.waitForReady();

		const text = await fetchText(url);
		expect(text).toBe("sent");
	});
});

describe("writes debug logs to hidden file", () => {
	it("writes to file when --log-level = debug", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
					name = "a"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
				`,
			"src/index.ts": dedent/* javascript */ `
					export default {
						fetch(req, env) {
							return new Response('A' + req.url);
						},
					};
					`,
			"package.json": dedent`
					{
						"name": "a",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
		const worker = helper.runLongLived("wrangler dev --log-level debug");

		const match = await worker.readUntil(
			/🪵 {2}Writing logs to "(?<filepath>.+\.log)"/
		);

		const filepath = match.groups?.filepath;
		assert(filepath);

		await setTimeout(1000); // wait a bit to ensure Wrangler starts writing

		expect(existsSync(filepath)).toBe(true);
	});

	it("does NOT write to file when --log-level != debug", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "a"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
			`,
			"src/index.ts": dedent/* javascript */ `
				export default {
					fetch(req, env) {
						return new Response('A' + req.url);
					},
				};
				`,
			"package.json": dedent`
				{
					"name": "a",
					"version": "0.0.0",
					"private": true
				}
				`,
		});

		const worker = helper.runLongLived("wrangler dev");

		await worker.waitForReady();

		expect(worker.output).not.toContain("Writing logs to");
	});
});

describe("zone selection", () => {
	it("defaults to a workers.dev preview", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat"]`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response(request.url)
					}
				}`,
			"package.json": dedent`
				{
					"name": "worker",
					"version": "0.0.0",
					"private": true
				}
				`,
		});
		const worker = helper.runLongLived("wrangler dev --remote");

		const { url } = await worker.waitForReady();

		const text = await fetchText(url);

		expect(text).toContain(`devprod-testing7928.workers.dev`);
	});

	it("respects dev.host setting", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat"]

				[dev]
				host = "wrangler-testing.testing.devprod.cloudflare.dev"`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response(request.url)
					}
				}`,
			"package.json": dedent`
				{
					"name": "worker",
					"version": "0.0.0",
					"private": true
				}
				`,
		});
		const worker = helper.runLongLived("wrangler dev --remote");

		const { url } = await worker.waitForReady();

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(
			`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
		);
	});

	it("infers host from first route", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat"]

				[[routes]]
				pattern = "wrangler-testing.testing.devprod.cloudflare.dev/*"
				zone_name = "testing.devprod.cloudflare.dev"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response(request.url)
					}
				}`,
			"package.json": dedent`
				{
					"name": "worker",
					"version": "0.0.0",
					"private": true
				}
				`,
		});
		const worker = helper.runLongLived("wrangler dev --remote");

		const { url } = await worker.waitForReady();

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(
			`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
		);
	});

	it("fails with useful error message if host is not routable", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "worker"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat"]

				[[routes]]
				pattern = "not-a-domain.testing.devprod.cloudflare.dev/*"
				zone_name = "testing.devprod.cloudflare.dev"
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						return new Response(request.url)
					}
				}`,
			"package.json": dedent`
				{
					"name": "worker",
					"version": "0.0.0",
					"private": true
				}
				`,
		});
		const worker = helper.runLongLived("wrangler dev --remote");

		await worker.readUntil(
			/Could not access `not-a-domain.testing.devprod.cloudflare.dev`. Make sure the domain is set up to be proxied by Cloudflare/
		);
	});
});

describe("custom builds", () => {
	it("does not hang when custom build does not cause esbuild to run", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
						name = "worker"
						compatibility_date = "2023-01-01"
						main = "src/index.ts"
						build.command = "echo 'hello'"
						build.watch_dir = "custom_src"
				`,
			"src/index.ts": dedent`
						export default {
							async fetch(request) {
								return new Response("Hello, World!")
							}
						}`,
		});
		const worker = helper.runLongLived("wrangler dev");

		const { url } = await worker.waitForReady();

		await fetch(url);

		let text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(`"Hello, World!"`);

		await helper.seed({
			"custom_src/foo.txt": "",
		});

		await worker.readUntil(/echo 'hello'/);

		text = await fetchText(url);
		expect(text).toMatchInlineSnapshot(`"Hello, World!"`);
	});
});
