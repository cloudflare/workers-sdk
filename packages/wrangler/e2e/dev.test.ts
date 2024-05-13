import assert from "node:assert";
import { existsSync } from "node:fs";
import * as nodeNet from "node:net";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { e2eTest } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { seed as baseSeed, makeRoot } from "./helpers/setup";
import {
	killAllWranglerDev,
	waitForReady,
	waitForReload,
} from "./helpers/wrangler";

beforeEach(killAllWranglerDev);

// Use `Agent` with lower timeouts so `fetch()`s inside `retry()`s don't block for a long time
setGlobalDispatcher(
	new Agent({
		connectTimeout: 10_000,
		headersTimeout: 10_000,
		bodyTimeout: 10_000,
	})
);

type MaybePromise<T = void> = T | Promise<T>;

const waitForPortToBeBound = async (port: number) => {
	await retry(
		() => false, // only retry if promise below rejects (network error)
		() => fetch(`http://127.0.0.1:${port}`)
	);
};

const waitUntilOutputContains = async (
	session: SessionData,
	substring: string,
	intervalMs = 100
) => {
	await retry(
		(stdout) => !stdout.includes(substring),
		async () => {
			await setTimeout(intervalMs);
			return session.stdout + "\n\n\n" + session.stderr;
		}
	);
};

interface SessionData {
	port: number;
	stdout: string;
	stderr: string;
}

function getPort() {
	return new Promise<number>((resolve, reject) => {
		const server = nodeNet.createServer((socket) => socket.destroy());
		server.listen(0, () => {
			const address = server.address();
			assert(typeof address === "object" && address !== null);
			server.close((err) => {
				if (err) reject(err);
				else resolve(address.port);
			});
		});
	});
}

async function runDevSession(
	workerPath: string,
	flags: string,
	session: (sessionData: SessionData) => MaybePromise
) {
	let pid;
	try {
		const portFlagMatch = flags.match(/--port (\d+)/);
		let port = 0;
		if (portFlagMatch) {
			port = parseInt(portFlagMatch[1]);
		}
		if (port === 0) {
			port = await getPort();
			flags += ` --port ${port}`;
		}

		// Must use the `in` statement in the shellac script rather than `.in()` modifier on the `shellac` object
		// otherwise the working directory does not get picked up.
		let promiseResolve: (() => void) | undefined;
		const promise = new Promise<void>((resolve) => (promiseResolve = resolve));
		const bg = await shellac.env(process.env).bg`
		await ${() => promise}

		in ${workerPath} {
			exits {
		$ ${WRANGLER} dev ${flags}
			}
		}
			`;
		pid = bg.pid;

		// sessionData is a mutable object where stdout/stderr update
		const sessionData: SessionData = {
			port,
			stdout: "",
			stderr: "",
		};
		bg.process.stdout.on("data", (chunk) => (sessionData.stdout += chunk));
		bg.process.stderr.on("data", (chunk) => (sessionData.stderr += chunk));
		// Only start `wrangler dev` once we've registered output listeners so we don't miss messages
		promiseResolve?.();

		await session(sessionData);

		return bg.promise;
	} finally {
		try {
			if (pid) process.kill(pid);
		} catch {
			// Ignore errors if we failed to kill the process (i.e. ESRCH if it's already terminated)
		}
	}
}

type DevWorker = {
	workerName: string;
	workerPath: string;
	runDevSession: (
		flags: string,
		session: (sessionData: SessionData) => MaybePromise
	) => ReturnType<typeof runDevSession>;
	seed: (
		seeder: ((name: string) => Record<string, string>) | Record<string, string>
	) => ReturnType<typeof seed>;
};
async function makeWorker(): Promise<DevWorker> {
	const root = await makeRoot();
	const workerName = `tmp-e2e-wrangler-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);

	return {
		workerName,
		workerPath,
		runDevSession: (
			flags: string,
			session: (sessionData: SessionData) => MaybePromise
		) => runDevSession(workerPath, flags, session),
		seed: (seeder) =>
			seed(
				workerPath,
				typeof seeder === "function" ? seeder(workerName) : seeder
			),
	};
}

describe("basic dev tests", () => {
	let worker: DevWorker;

	beforeEach(async () => {
		worker = await makeWorker();
		await worker.seed((workerName) => ({
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
			const worker = run(cmd);

			const { url } = await waitForReady(worker);

			await expect(fetch(url).then((r) => r.text())).resolves.toMatchSnapshot();

			await seed({
				"src/index.ts": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker! " + env.KEY)
							}
						}`,
			});

			await waitForReload(worker);

			await expect(fetchText(url)).resolves.toMatchSnapshot();
		});
	}
);

describe.each([{ cmd: "wrangler dev" }, { cmd: "wrangler dev --remote" }])(
	"basic python dev: $cmd",
	({ cmd }) => {
		e2eTest(`can modify worker during ${cmd}`, async ({ run, seed }) => {
			await seed({
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
			const worker = run(cmd);

			const { url } = await waitForReady(worker);

			await expect(fetchText(url)).resolves.toBe("py hello world 6");

			await seed({
				"index.py": dedent`
					from arithmetic import mul

					from js import Response
					def on_fetch(request):
						return Response.new(f"Updated Python Worker value {mul(2,3)}")`,
				"arithmetic.py": dedent`
					def mul(a,b):
						return a+b`,
			});

			// TODO(soon): work out why python workers reload twice
			await waitForReload(worker);
			await waitForReload(worker);

			// TODO(soon): work out why python workers need this delay before returning new content
			await setTimeout(5_000);

			await expect(fetchText(url)).resolves.toBe(
				"Updated Python Worker value 5"
			);
		});
	}
);

describe("dev registry", () => {
	let a: string;
	let b: string;

	beforeEach(async () => {
		a = await makeRoot();
		await baseSeed(a, {
			"wrangler.toml": dedent`
					name = "a"
					main = "src/index.ts"

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

	e2eTest("can fetch b", async ({ run }) => {
		const worker = run("wrangler dev", { cwd: b });

		const { url } = await waitForReady(worker);

		await expect(
			fetch(url).then((r) => r.text())
		).resolves.toMatchInlineSnapshot('"hello world"');
	});

	e2eTest("can fetch b through a (start b, start a)", async ({ run }) => {
		const workerB = run("wrangler dev", { cwd: b });
		// We don't need b's URL, but ensure that b starts up before a
		await waitForReady(workerB);

		const workerA = run("wrangler dev", { cwd: a });
		const { url } = await waitForReady(workerA);

		// TODO(soon): Service bindings are only accessible after several reloads. We should fix this
		await waitForReload(workerA);
		await waitForReload(workerA);

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			'"hello world"'
		);
	});

	e2eTest("can fetch b through a (start a, start b)", async ({ run }) => {
		const workerA = run("wrangler dev", { cwd: a });
		const { url } = await waitForReady(workerA);

		const workerB = run("wrangler dev", { cwd: b });
		await waitForReady(workerB);

		// TODO(soon): Service bindings are only accessible after several reloads. We should fix this
		await waitForReload(workerA);
		await waitForReload(workerA);

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			'"hello world"'
		);
	});
});

describe("hyperdrive dev tests", () => {
	let server: nodeNet.Server;

	beforeEach(async () => {
		server = nodeNet.createServer().listen();
	});

	e2eTest(
		"matches expected configuration parameters",
		async ({ run, seed }) => {
			let port = 5432;
			if (server.address() && typeof server.address() !== "string") {
				port = (server.address() as nodeNet.AddressInfo).port;
			}
			await seed({
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
			const worker = run("wrangler dev");
			const { url } = await waitForReady(worker);

			const text = await fetchText(url);

			const hyperdrive = new URL(text);
			expect(hyperdrive.pathname).toBe("/some_db");
			expect(hyperdrive.username).toBe("user");
			expect(hyperdrive.password).toBe("!pass");
			expect(hyperdrive.host).not.toBe("localhost");
		}
	);

	e2eTest("connects to a socket", async ({ run, seed }) => {
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await seed({
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

		const worker = run("wrangler dev");

		const { url } = await waitForReady(worker);

		await fetch(`${url}/connect`);

		await socketMsgPromise;
	});

	e2eTest(
		"uses HYPERDRIVE_LOCAL_CONNECTION_STRING for the localConnectionString variable in the binding",
		async ({ run, seed }) => {
			let port = 5432;
			if (server.address() && typeof server.address() !== "string") {
				port = (server.address() as nodeNet.AddressInfo).port;
			}
			await seed({
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

			const worker = run("wrangler dev", {
				env: {
					...process.env,
					WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: `postgresql://user:pass@127.0.0.1:${port}/some_db`,
				},
			});

			const { url } = await waitForReady(worker);
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
		}
	);

	afterEach(() => {
		if (server.listening) {
			server.close();
		}
	});
});

describe("queue dev tests", () => {
	e2eTest(
		"matches expected configuration parameters",
		async ({ run, seed }) => {
			await seed({
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
			const worker = run("wrangler dev");
			const { url } = await waitForReady(worker);

			const text = await fetchText(url);
			expect(text).toBe("sent");
		}
	);
});

describe("writes debug logs to hidden file", () => {
	e2eTest("writes to file when --log-level = debug", async ({ run, seed }) => {
		await seed({
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
		const worker = run("wrangler dev --log-level debug");

		const match = await worker.readUntil(
			/🪵 {2}Writing logs to "(?<filepath>.+\.log)"/
		);

		const filepath = match.groups?.filepath;
		assert(filepath);

		await setTimeout(1000); // wait a bit to ensure Wrangler starts writing

		expect(existsSync(filepath)).toBe(true);
	});

	e2eTest(
		"does NOT write to file when --log-level != debug",
		async ({ run, seed }) => {
			await seed({
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

			const worker = run("wrangler dev");

			await waitForReady(worker);

			expect(worker.output).not.toContain("Writing logs to");
		}
	);
});

describe("zone selection", () => {
	e2eTest("defaults to a workers.dev preview", async ({ run, seed }) => {
		await seed({
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
		const worker = run("wrangler dev --remote");

		const { url } = await waitForReady(worker);

		const text = await fetchText(url);

		expect(text).toContain(`devprod-testing7928.workers.dev`);
	});

	e2eTest("respects dev.host setting", async ({ run, seed }) => {
		await seed({
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
		const worker = run("wrangler dev --remote");

		const { url } = await waitForReady(worker);

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(
			`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
		);
	});
	e2eTest("infers host from first route", async ({ run, seed }) => {
		await seed({
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
		const worker = run("wrangler dev --remote");

		const { url } = await waitForReady(worker);

		const text = await fetchText(url);

		expect(text).toMatchInlineSnapshot(
			`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
		);
	});
	e2eTest(
		"fails with useful error message if host is not routable",
		async ({ run, seed }) => {
			await seed({
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
			const worker = run("wrangler dev --remote");

			await worker.readUntil(
				/Could not access `not-a-domain.testing.devprod.cloudflare.dev`. Make sure the domain is set up to be proxied by Cloudflare/
			);
		}
	);
});

describe("custom builds", () => {
	e2eTest(
		"does not hang when custom build does not cause esbuild to run",
		async ({ run, seed }) => {
			await seed({
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
			const worker = run("wrangler dev");

			const { url } = await waitForReady(worker);

			await fetch(url);

			let text = await fetchText(url);

			expect(text).toMatchInlineSnapshot(`"Hello, World!"`);

			await seed({
				"custom_src/foo.txt": "",
			});

			await worker.readUntil(/echo 'hello'/);

			text = await fetchText(url);
			expect(text).toMatchInlineSnapshot(`"Hello, World!"`);
		}
	);
});
