import assert from "node:assert";
import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import * as nodeNet from "node:net";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { fetchWithETag } from "./helpers/fetch-with-etag";
import { generateResourceName } from "./helpers/generate-resource-name";
import { retry } from "./helpers/retry";

/**
 * We use the same workerName for all of the tests in this suite in hopes of reducing flakes.
 * When creating a new worker, a <workerName>.devprod-testing7928.workers.dev subdomain is created.
 * The platform API locks a database table for the zone (devprod-testing7928.workers.dev) while doing this.
 * Creating many workers in the same account/zone in quick succession can run up against the lock.
 * This test suite runs sequentially so does not cause lock issues for itself, but we run into lock issues
 * when multiple PRs have jobs running at the same time (or the same PR has the tests run across multiple OSes).
 */
const workerName = generateResourceName();

it("can import URL from 'url' in nodejs_compat mode", async () => {
	const helper = new WranglerE2ETestHelper();
	await helper.seed({
		"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2023-01-01"
				compatibility_flags = ["nodejs_compat"]
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

describe.each([{ cmd: "wrangler dev" }, { cmd: "wrangler dev --remote" }])(
	"basic js dev: $cmd",
	({ cmd }) => {
		it(`can modify worker during ${cmd}`, async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.toml": dedent`
							name = "${workerName}"
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

		it(`hotkeys can be disabled with ${cmd}`, async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.toml": dedent`
							name = "${workerName}"
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
			const worker = helper.runLongLived(
				`${cmd} --show-interactive-dev-session=false`
			);

			const { url } = await worker.waitForReady();

			await expect(fetch(url).then((r) => r.text())).resolves.toMatchSnapshot();

			await expect(worker.currentOutput).not.toContain("[b] open a browser");
		});

		describe(`--test-scheduled works with ${cmd}`, async () => {
			it("custom build", async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								main = "src/index.ts"
								compatibility_date = "2023-01-01"
								[build]
								command = "true"
						`,
					"src/index.ts": dedent`
								export default {
									scheduled(event) {
										console.log("Event triggered")
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
				const worker = helper.runLongLived(`${cmd} --test-scheduled`);

				const { url } = await worker.waitForReady();

				await expect(
					fetch(`${url}/__scheduled`).then((r) => r.text())
				).resolves.toMatchSnapshot();

				await worker.readUntil(/Event triggered/);
			});

			it("no custom build", async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								main = "src/index.ts"
								compatibility_date = "2023-01-01"
						`,
					"src/index.ts": dedent`
								export default {
									scheduled(event) {
										console.log("Event triggered")
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
				const worker = helper.runLongLived(`${cmd} --test-scheduled`);

				const { url } = await worker.waitForReady();

				await expect(
					fetch(`${url}/__scheduled`).then((r) => r.text())
				).resolves.toMatchSnapshot();

				await worker.readUntil(/Event triggered/);
			});
		});
	}
);

interface Process {
	pid: string;
	cmd: string;
}

function getProcesses(): Process[] {
	return childProcess
		.execSync("ps -e | awk '{print $1,$4}'", { encoding: "utf8" })
		.trim()
		.split("\n")
		.map((line) => {
			const [pid, cmd] = line.split(" ");
			return { pid, cmd };
		});
}

function getProcessCwd(pid: string | number) {
	return childProcess
		.execSync(`lsof -p ${pid} | awk '$4=="cwd" {print $9}'`, {
			encoding: "utf8",
		})
		.trim();
}
function getStartedWorkerdProcesses(cwd: string): Process[] {
	return getProcesses()
		.filter(({ cmd }) => cmd.includes("workerd"))
		.filter((c) => getProcessCwd(c.pid).includes(cwd));
}

// This fails on Windows because of https://github.com/cloudflare/workerd/issues/1664
it.runIf(process.platform !== "win32")(
	`leaves no orphaned workerd processes with port conflict`,
	async () => {
		const initial = new WranglerE2ETestHelper();
		await initial.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
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
		const initialWorker = initial.runLongLived(`wrangler dev`);

		const { url: initialWorkerUrl } = await initialWorker.waitForReady();

		const port = new URL(initialWorkerUrl).port;

		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
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
		const beginProcesses = getStartedWorkerdProcesses(helper.tmpPath);
		// If a port isn't specified, Wrangler will start up on a different random port. In this test we want to force an address-in-use error
		const worker = helper.runLongLived(`wrangler dev --port ${port}`);

		const exitCode = await worker.exitCode;

		expect(exitCode).not.toBe(0);

		const endProcesses = getStartedWorkerdProcesses(helper.tmpPath);

		expect(beginProcesses.length).toBe(0);
		expect(endProcesses.length).toBe(0);
	}
);

// Skipping remote python tests because they consistently flake with timeouts
// Unskip once remote dev with python workers is more stable
describe.each([{ cmd: "wrangler dev" }])(
	"basic python dev: $cmd",
	{ timeout: 90_000 },
	({ cmd }) => {
		it(`can modify entrypoint during ${cmd}`, async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.toml": dedent`
					name = "${workerName}"
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
					name = "${workerName}"
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
					name = "${workerName}"
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
					name = "${workerName}"
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
					name = "${workerName}"
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
					name = "${workerName}"
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
					name = "${workerName}"
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
				name = "${workerName}"
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

describe("analytics engine", () => {
	describe.each([{ cmd: "wrangler dev" }, { cmd: "wrangler dev --remote" }])(
		"mock analytics engine datasets: $cmd",
		({ cmd }) => {
			describe("module worker", () => {
				it("analytics engine datasets are mocked in dev", async () => {
					const helper = new WranglerE2ETestHelper();
					await helper.seed({
						"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2024-08-08"

				[[analytics_engine_datasets]]
				binding = "ANALYTICS_BINDING"
				dataset = "ANALYTICS_DATASET"
			`,
						"src/index.ts": dedent`
				export default {
					fetch(request, env) {
						// let's make an analytics call
						env.ANALYTICS_BINDING.writeDataPoint({
							'blobs': ["Seattle", "USA", "pro_sensor_9000"], // City, State
							'doubles': [25, 0.5],
							'indexes': ["a3cd45"]
						});
						// and return a response
						return new Response("successfully wrote datapoint from module worker");
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

					const text = await fetchText(url);
					expect(text).toContain(
						`successfully wrote datapoint from module worker`
					);
				});
			});

			describe("service worker", async () => {
				it("analytics engine datasets are mocked in dev", async () => {
					const helper = new WranglerE2ETestHelper();
					await helper.seed({
						"wrangler.toml": dedent`
				name = "${workerName}"
				main = "src/index.ts"
				compatibility_date = "2024-08-08"

				[[analytics_engine_datasets]]
				binding = "ANALYTICS_BINDING"
				dataset = "ANALYTICS_DATASET"
			`,
						"src/index.ts": dedent`
							addEventListener("fetch", (event) => {
								// let's make an analytics call
								ANALYTICS_BINDING.writeDataPoint({
									blobs: ["Seattle", "USA", "pro_sensor_9000"], // City, State
									doubles: [25, 0.5],
									indexes: ["a3cd45"],
								});
								// and return a response
								event.respondWith(new Response("successfully wrote datapoint from service worker"));
							});
				`,
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

					const text = await fetchText(url);
					expect(text).toContain(
						`successfully wrote datapoint from service worker`
					);
				});
			});
		}
	);
});

describe("zone selection", () => {
	it("defaults to a workers.dev preview", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
				name = "${workerName}"
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
				name = "${workerName}"
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
				name = "${workerName}"
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
				name = "${workerName}"
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
						name = "${workerName}"
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

	it("does not infinite-loop custom build with assets", async () => {
		const helper = new WranglerE2ETestHelper();
		await helper.seed({
			"wrangler.toml": dedent`
                    name = "${workerName}"
                    compatibility_date = "2023-01-01"
                    main = "src/index.ts"
                    build.command = "echo 'hello' > ./public/index.html"

                    [assets]
                    directory = "./public"
            `,
			"src/index.ts": dedent`
                export default {
                    async fetch(request) {
                        return new Response("Hello, World!")
                    }
                }
            `,
			"public/other.html": "ensure ./public exists",
		});
		const worker = helper.runLongLived("wrangler dev");

		// first build on startup
		await worker.readUntil(/Running custom build/, 5_000);
		// second build for first watcher notification (can be optimised away, leaving as-is for now)
		await worker.readUntil(/Running custom build/, 5_000);

		// Need to get the url in this order because waitForReady calls readUntil
		// which keeps track of where it's read up to so far,
		// so the expect(waitUntil).reject assertion below
		// will eat up the "Ready on http://localhost:8787" message if called before.
		// This could cause a flake if eg the 2nd custom build starts after ready.
		const { url } = await worker.waitForReady();

		// assert no more custom builds happen
		// regression: https://github.com/cloudflare/workers-sdk/issues/6876
		await expect(
			worker.readUntil(/Running custom build:/, 5_000)
		).rejects.toThrowError();

		// now check assets are still fetchable, even after updates

		const res = await fetch(url);
		await expect(res.text()).resolves.toContain("hello");

		await helper.seed({
			"public/index.html": "world",
		});

		const resText = await retry(
			(text) => text.includes("hello"),
			async () => {
				const res2 = await fetch(url);
				return res2.text();
			}
		);
		await expect(resText).toBe("world");
	});
});

describe("watch mode", () => {
	describe.each([{ cmd: "wrangler dev" }])(
		"Workers watch mode: $cmd",
		({ cmd }) => {
			it(`supports modifying the Worker script during dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								main = "src/workerA.ts"
								compatibility_date = "2023-01-01"
						`,
					"src/workerA.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker A!")
							}
						}`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let text = await fetchText(url);
				expect(text).toBe("Hello from user Worker A!");

				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								main = "src/workerB.ts"
								compatibility_date = "2023-01-01"
						`,
					"src/workerB.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker B!")
							}
						}`,
				});

				await worker.waitForReload();
				text = await retry(
					(s) => s != "Hello from user Worker B!",
					async () => {
						return await fetchText(url);
					}
				);
				expect(text).toBe("Hello from user Worker B!");
			});
		}
	);

	describe.each([{ cmd: "wrangler dev" }])(
		"Workers + Assets watch mode: $cmd",
		({ cmd }) => {
			it(`supports modifying existing assets during dev session and errors when invalid routes are added`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let { response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					{}
				);
				const originalETag = response.headers.get("etag");
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				await helper.seed({
					"public/index.html": dedent`
							<h1>Hello Updated Workers + Assets</h1>`,
				});

				await worker.waitForReload();
				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 200,
					async () => {
						return await fetchWithETag(`${url}/index.html`, cachedETags);
					}
				));
				expect(await response.text()).toBe(
					"<h1>Hello Updated Workers + Assets</h1>"
				);
				// expect a new eTag back because the content for this path has changed
				expect(response.headers.get("etag")).not.toBe(originalETag);

				// changes to routes should error while in watch mode
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"
								route = "example.com/path/*"

								[assets]
								directory = "./public"
						`,
				});
				await worker.readUntil(/Invalid Routes:/);
			});

			it(`supports adding new assets during dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();
				let { response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					{}
				);

				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				await helper.seed({
					"public/about.html": dedent`About Workers + Assets`,
					"public/workers/index.html": dedent`Cloudflare Workers!`,
				});

				await worker.waitForReload();

				// re-calculating the asset manifest / reverse assets map might not be
				// done at this point, so retry until they are available
				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 200,
					async () => {
						return await fetchWithETag(`${url}/about.html`, cachedETags);
					}
				));
				expect(await response.text()).toBe("About Workers + Assets");

				({ response, cachedETags } = await fetchWithETag(
					`${url}/workers/index.html`,
					cachedETags
				));
				expect(await response.text()).toBe("Cloudflare Workers!");

				// expect 304 for the original asset as the content has not changed
				({ response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					cachedETags
				));
				expect(response.status).toBe(304);
			});

			it(`supports removing existing assets during dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
					"public/about.html": dedent`About Workers + Assets`,
					"public/workers/index.html": dedent`Cloudflare Workers!`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();
				let { response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					{}
				);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				({ response, cachedETags } = await fetchWithETag(
					`${url}/about.html`,
					cachedETags
				));
				expect(await response.text()).toBe("About Workers + Assets");
				({ response, cachedETags } = await fetchWithETag(
					`${url}/workers/index.html`,
					cachedETags
				));
				expect(await response.text()).toBe("Cloudflare Workers!");

				await helper.removeFiles(["public/index.html"]);

				await worker.waitForReload();

				// re-calculating the asset manifest / reverse assets map might not be
				// done at this point, so retry until they are available
				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 404,
					async () => {
						return await fetchWithETag(`${url}/index.html`, cachedETags);
					}
				));
				expect(response.status).toBe(404);
			});

			it(`supports modifying the assets directory in wrangler.toml during dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});
				await helper.seed({
					"public2/index.html": dedent`
								<h1>Hola Workers + Assets</h1>`,
					"public2/about/index.html": dedent`
								<h1>Read more about Workers + Assets</h1>`,
				});
				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let { response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					{}
				);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							compatibility_date = "2023-01-01"

							[assets]
							directory = "./public2"
					`,
				});

				await worker.waitForReload();

				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 200,
					async () => {
						return await fetchWithETag(`${url}/index.html`, cachedETags);
					}
				));
				expect(await response.text()).toBe("<h1>Hola Workers + Assets</h1>");
				({ response, cachedETags } = await fetchWithETag(
					`${url}/about/index.html`,
					{}
				));
				expect(await response.text()).toBe(
					"<h1>Read more about Workers + Assets</h1>"
				);
			});

			it(`supports switching from Workers without assets to assets-only Workers during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
					"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker!")
							}
						}`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});

				await worker.waitForReload();

				// verify response from Asset Worker
				const { status, text } = await retry(
					(s) => s.text !== "<h1>Hello Workers + Assets</h1>",
					async () => {
						const fetchResponse = await fetch(url);
						return {
							status: fetchResponse.status,
							text: await fetchResponse.text(),
						};
					}
				);
				expect(status).toBe(200);
				expect(text).toBe("<h1>Hello Workers + Assets</h1>");

				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify we no longer get a response from the User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(404);
			});

			it(`supports switching from Workers without assets to Workers with assets during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
					"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker!")
							}
						}`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								main = "src/index.ts"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});

				await worker.waitForReload();

				// verify response from Asset Worker
				const { status, text } = await retry(
					(s) => s.text !== "<h1>Hello Workers + Assets</h1>",
					async () => {
						const fetchResponse = await fetch(url);
						return {
							status: fetchResponse.status,
							text: await fetchResponse.text(),
						};
					}
				);
				expect(status).toBe(200);
				expect(text).toBe("<h1>Hello Workers + Assets</h1>");

				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify response from the User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");
			});

			it(`supports switching from assets-only Workers to Workers with assets during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
					"public/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
				});
				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				// verify response from Asset Worker
				let response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify no response from route that will be handled by the
				// User Worker in the future
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(404);

				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"

							[assets]
							directory = "./public"
					`,
					"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker!")
							}
						}`,
				});

				await worker.waitForReload();

				// verify we still get the correct response for the Asset Worker
				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify response from User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");
			});

			it(`supports switching from Workers with assets to assets-only Workers during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"

							[assets]
							directory = "./public"
					`,
					"public/index.html": dedent`
							<h1>Hello Workers + Assets</h1>`,
					"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Hello from user Worker!")
							}
						}`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				// verify response from Asset Worker
				let response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify response from User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"

								[assets]
								directory = "./public"
						`,
				});

				await worker.waitForReload();

				// verify we still get the correct response from Asset Worker
				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify we no longer get a response from the User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(404);
			});

			it("debounces runtime restarts when assets are modified", async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
						name = "${workerName}"
						compatibility_date = "2023-01-01"
						main = "src/index.ts"

						[assets]
						directory = "./public"
				`,
					"src/index.ts": dedent`
					export default {
						async fetch(request) {
							return new Response("Hello, World!")
						}
					}
				`,
					"public/index.html": "Hello from Assets",
				});
				const worker = helper.runLongLived("wrangler dev");

				const { url } = await worker.waitForReady();

				// Modify assets multiple times in quick succession

				await helper.seed({
					"public/a.html": "a",
				});

				await helper.seed({
					"public/b.html": "b",
				});

				await helper.seed({
					"public/c.html": "c",
				});

				await worker.waitForReload();

				// The three changes should be debounced, so only one reload should occur
				await expect(worker.waitForReload(5_000)).rejects.toThrowError();

				// now check assets are still fetchable
				await expect(fetchText(url)).resolves.toBe("Hello from Assets");
			});
		}
	);

	describe.each([{ cmd: "wrangler dev --assets=dist" }])(
		"Workers + Assets watch mode: $cmd",
		({ cmd }) => {
			it(`supports modifying assets during dev session and errors when invalid routes are added`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"
						`,
					"dist/index.html": dedent`
								<h1>Hello Workers + Assets</h1>`,
					"dist/about.html": dedent`
								<h1>Read more about Workers + Assets</h1>`,
				});

				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				let { response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					{}
				);
				const originalETag = response.headers.get("etag");
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				({ response, cachedETags } = await fetchWithETag(
					`${url}/about.html`,
					cachedETags
				));
				expect(await response.text()).toBe(
					"<h1>Read more about Workers + Assets</h1>"
				);

				// change + add
				await helper.seed({
					"dist/index.html": dedent`
							<h1>Hello Updated Workers + Assets</h1>`,
					"dist/hello.html": dedent`
							<h1>Hya Workers!</h1>`,
				});

				await worker.waitForReload();

				// re-calculating the asset manifest / reverse assets map might not be
				// done at this point, so retry until they are available
				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 200,
					async () => {
						return await fetchWithETag(`${url}/hello.html`, cachedETags);
					}
				));
				expect(await response.text()).toBe("<h1>Hya Workers!</h1>");

				({ response, cachedETags } = await fetchWithETag(
					`${url}/index.html`,
					cachedETags
				));
				expect(await response.text()).toBe(
					"<h1>Hello Updated Workers + Assets</h1>"
				);
				expect(response.headers.get("etag")).not.toBe(originalETag);

				// unchanged -> expect 304
				({ response, cachedETags } = await fetchWithETag(
					`${url}/about.html`,
					cachedETags
				));
				expect(response.status).toBe(304);

				// remove
				await helper.removeFiles(["dist/about.html"]);

				await worker.waitForReload();

				// re-calculating the asset manifest / reverse assets map might not be
				// done at this point, so retry until they are available
				({ response, cachedETags } = await retry(
					(s) => s.response.status !== 404,
					async () => {
						return await fetchWithETag(`${url}/about.html`, cachedETags);
					}
				));
				expect(response.status).toBe(404);

				// changes to routes should error while in watch mode
				await helper.seed({
					"wrangler.toml": dedent`
								name = "${workerName}"
								compatibility_date = "2023-01-01"
								route = "example.com/path/*"
						`,
				});
				await worker.readUntil(/Invalid Routes:/);
			});

			it(`supports switching from assets-only Workers to Workers with assets during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							compatibility_date = "2023-01-01"
					`,
					"dist/index.html": dedent`
					<h1>Hello Workers + Assets</h1>`,
					"src/index.ts": dedent`
					export default {
						fetch(request) {
							return new Response("Hello from user Worker!")
						}
					}`,
				});
				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				// verify response from Asset Worker
				let response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify no response from route that will be handled by the
				// User Worker in the future
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(404);

				await helper.seed({
					"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
				`,
				});

				await worker.waitForReload();

				// verify response from Asset Worker
				response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify response from User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");
			});

			it(`supports switching from Workers with assets to assets-only Workers during the current dev session`, async () => {
				const helper = new WranglerE2ETestHelper();
				await helper.seed({
					"wrangler.toml": dedent`
							name = "${workerName}"
							main = "src/index.ts"
							compatibility_date = "2023-01-01"
					`,
					"dist/index.html": dedent`
					<h1>Hello Workers + Assets</h1>`,
					"src/index.ts": dedent`
					export default {
						fetch(request) {
							return new Response("Hello from user Worker!")
						}
					}`,
				});
				const worker = helper.runLongLived(cmd);
				const { url } = await worker.waitForReady();

				// verify response from Asset Worker
				let response = await fetch(`${url}/index.html`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify response from User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("Hello from user Worker!");

				await helper.seed({
					"wrangler.toml": dedent`
						name = "${workerName}"
						compatibility_date = "2023-01-01"
				`,
				});

				await worker.waitForReload();

				response = await fetch(`${url}/index.html`);
				// verify response from Asset
				expect(response.status).toBe(200);
				expect(await response.text()).toBe("<h1>Hello Workers + Assets</h1>");

				// verify no response from User Worker
				response = await fetch(`${url}/hey`);
				expect(response.status).toBe(404);
			});
		}
	);
});
