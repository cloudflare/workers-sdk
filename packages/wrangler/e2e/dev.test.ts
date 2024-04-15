import assert from "node:assert";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import * as nodeNet from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import shellac from "shellac";
import dedent from "ts-dedent";
import { Agent, fetch, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeOutput } from "./helpers/normalize";
import { retry } from "./helpers/retry";
import { makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler";

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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
	});
	it("can import URL from 'url' in node_compat mode", async () => {
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
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
		}));
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot(
				`"postgresql://user:password@example.com:12345/dbname?sslmode=disablepostgresql://user:password@example.com:12345/dbname?sslmode=disable"`
			);
		});
	});

	it("can modify worker during dev session (local)", async () => {
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await worker.seed({
				"src/index.ts": dedent`
						import { Buffer } from "node:buffer";
						export default {
							fetch(request, env) {
								const base64Message = Buffer.from("Updated Worker!").toString("base64");
								const message = Buffer.from(base64Message, "base64").toString();
								return new Response(message + " " + env.KEY)
							}
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker! value"');

			await worker.seed((workerName) => ({
				"wrangler.toml": dedent`
						name = "${workerName}"
						main = "src/index.ts"
						compatibility_date = "2023-01-01"
						compatibility_flags = ["nodejs_compat"]

						[vars]
						KEY = "updated"
				`,
			}));
			const { text: text3 } = await retry(
				(s) => s.status !== 200 || s.text === "Updated Worker! value",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text3).toMatchInlineSnapshot('"Updated Worker! updated"');
		});
	});

	it("can modify worker during dev session (remote)", async () => {
		await worker.runDevSession("--remote --ip 127.0.0.1", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200 || s.text === "",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await worker.seed({
				"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Updated Worker!")
							}
						}`,
			});

			// Give a bit of time for the change to propagate.
			// Otherwise the process has a tendency to hang.
			await setTimeout(5000);

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
	});
});

describe("basic dev python tests", () => {
	let worker: DevWorker;

	beforeEach(async () => {
		worker = await makeWorker();
		await worker.seed((workerName) => ({
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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
	});

	it("can run and modify python worker entrypoint during dev session (local)", async () => {
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"py hello world 6"');

			await worker.seed({
				"index.py": dedent`
					from js import Response
					def on_fetch(request):
						return Response.new('Updated Python Worker value')`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "py hello world 6",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Python Worker value"');
		});
	});
	it("can run and modify python worker imports during dev session (local)", async () => {
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"py hello world 6"');

			await worker.seed({
				"arithmetic.py": dedent`
					def mul(a,b):
						return a+b`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "py hello world 6",
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"py hello world 5"');
		});
	});
});

describe("python dependency tests", () => {
	let worker: DevWorker;

	beforeEach(async () => {
		worker = await makeWorker();
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "index.py"
					compatibility_date = "2024-03-20"
					compatibility_flags = ["python_workers"]
			`,
			"requirements.txt": dedent`
			# comment
			numpy # comment 2`,
			"index.py": dedent`
					import numpy as np

					from js import Response
					def on_fetch(request):
						return Response.new(str(np.array([1, 2, 3])))`,
			"package.json": dedent`
					{
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
	});

	it("can parse requirements file and use dependencies", async () => {
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"[1 2 3]"');
		});
	});
});

describe("dev registry", () => {
	let a: DevWorker;
	let b: DevWorker;

	beforeEach(async () => {
		a = await makeWorker();
		await a.seed({
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

		b = await makeWorker();
		await b.seed({
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
		await b.runDevSession("", async (sessionB) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${sessionB.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"hello world"');
		});
	});

	it("can fetch b through a (start b, start a)", async () => {
		await b.runDevSession("", async () => {
			await a.runDevSession("", async (sessionA) => {
				const { text } = await retry(
					(s) => s.status !== 200,
					async () => {
						const r = await fetch(`http://127.0.0.1:${sessionA.port}`);
						return { text: await r.text(), status: r.status };
					}
				);
				expect(text).toMatchInlineSnapshot('"hello world"');
			});
		});
	});

	it("can fetch b through a (start a, start b)", async () => {
		await a.runDevSession("", async (sessionA) => {
			await b.runDevSession("", async () => {
				const { text } = await retry(
					(s) => s.status !== 200,
					async () => {
						const r = await fetch(`http://127.0.0.1:${sessionA.port}`);
						return { text: await r.text(), status: r.status };
					}
				);
				expect(text).toMatchInlineSnapshot('"hello world"');
			});
		});
	});
});

describe("hyperdrive dev tests", () => {
	let worker: DevWorker;
	let server: nodeNet.Server;

	beforeEach(async () => {
		worker = await makeWorker();
		server = nodeNet.createServer().listen();
	});

	it("matches expected configuration parameters", async () => {
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await worker.seed((workerName) => ({
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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
		await worker.runDevSession("", async (session) => {
			const { text } = await retry(
				(s) => {
					return s.status !== 200;
				},
				async () => {
					const resp = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await resp.text(), status: resp.status };
				}
			);
			const url = new URL(text);
			expect(url.pathname).toBe("/some_db");
			expect(url.username).toBe("user");
			expect(url.password).toBe("!pass");
			expect(url.host).not.toBe("localhost");
		});
	});

	it("connects to a socket", async () => {
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await worker.seed((workerName) => ({
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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
		const socketMsgPromise = new Promise((resolve, _) => {
			server.on("connection", (sock) => {
				sock.on("data", (data) => {
					expect(new TextDecoder().decode(data)).toBe("test string");
					server.close();
					resolve({});
				});
			});
		});
		await worker.runDevSession("", async (session) => {
			await retry(
				(s) => {
					return s.status !== 200;
				},
				async () => {
					const resp = await fetch(`http://127.0.0.1:${session.port}/connect`);
					return { text: await resp.text(), status: resp.status };
				}
			);
		});
		await socketMsgPromise;
	});

	it("uses HYPERDRIVE_LOCAL_CONNECTION_STRING for the localConnectionString variable in the binding", async () => {
		let port = 5432;
		if (server.address() && typeof server.address() !== "string") {
			port = (server.address() as nodeNet.AddressInfo).port;
		}
		await worker.seed((workerName) => ({
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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
		const socketMsgPromise = new Promise((resolve, _) => {
			server.on("connection", (sock) => {
				sock.on("data", (data) => {
					expect(new TextDecoder().decode(data)).toBe("test string");
					server.close();
					resolve({});
				});
			});
		});
		// eslint-disable-next-line turbo/no-undeclared-env-vars
		process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = `postgresql://user:pass@127.0.0.1:${port}/some_db`;
		await worker.runDevSession("", async (session) => {
			await retry(
				(s) => {
					return s.status !== 200;
				},
				async () => {
					const resp = await fetch(`http://127.0.0.1:${session.port}/connect`);
					return { text: await resp.text(), status: resp.status };
				}
			);
		});
		await socketMsgPromise;
	});

	afterEach(() => {
		if (server.listening) {
			server.close();
		}
		if (
			// eslint-disable-next-line turbo/no-undeclared-env-vars
			process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE !==
			undefined
		) {
			// eslint-disable-next-line turbo/no-undeclared-env-vars
			delete process.env.WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
		}
	});
});

describe("writes debug logs to hidden file", () => {
	let a: DevWorker;
	let b: DevWorker;

	beforeEach(async () => {
		a = await makeWorker();
		await a.seed({
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

		b = await makeWorker();
		await b.seed({
			"wrangler.toml": dedent`
          name = "b"
          main = "src/index.ts"
          compatibility_date = "2023-01-01"
      `,
			"src/index.ts": dedent/* javascript */ `
        export default {
          fetch(req, env) {
            return new Response('B' + req.url);
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

	it("writes to file when --log-level = debug", async () => {
		const finalA = await a.runDevSession(
			"--log-level debug",
			async (session) => {
				await waitForPortToBeBound(session.port);

				await waitUntilOutputContains(session, "Writing logs to");

				await setTimeout(1000); // wait a bit to ensure the file is written to disk
			}
		);

		const filepath = finalA.stdout.match(
			/🪵 {2}Writing logs to "(.+\.log)"/
		)?.[1];
		assert(filepath);

		expect(existsSync(filepath)).toBe(true);
	});

	it("does NOT write to file when --log-level != debug", async () => {
		const finalA = await a.runDevSession("", async (session) => {
			await waitForPortToBeBound(session.port);

			await setTimeout(1000); // wait a bit to ensure no debug logs are written
		});

		const filepath = finalA.stdout.match(
			/🪵 {2}Writing logs to "(.+\.log)"/
		)?.[1];

		expect(filepath).toBeUndefined();
	});

	it.skip("rewrites address-in-use error logs", async () => {
		// 1. start worker A on a (any) port
		await a.runDevSession("", async (sessionA) => {
			const normalize = (text: string) =>
				normalizeOutput(text, { [sessionA.port]: "<PORT>" });

			// 2. wait until worker A is bound to its port
			await waitForPortToBeBound(sessionA.port);

			// 3. try to start worker B on the same port
			await b.runDevSession(`--port ${sessionA.port}`, async (sessionB) => {
				// 4. wait until wrangler tries to start workerd
				await waitUntilOutputContains(sessionB, "Starting local server...");
				// 5. wait a period of time for workerd to complain about the port being in use
				await setTimeout(1000);

				// ensure the workerd error message IS NOT present
				expect(normalize(sessionB.stderr)).not.toContain(
					"Address already in use; toString() = "
				);
				// ensure the wrangler (nicer) error message IS present
				expect(normalize(sessionB.stderr)).toContain(
					"[ERROR] Address already in use"
				);
			});
		});
	});
});

describe("zone selection", () => {
	let worker: DevWorker;

	beforeEach(async () => {
		worker = await makeWorker();
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["nodejs_compat"]
			`,
			"src/index.ts": dedent`
					export default {
						fetch(request) {
							return new Response(request.url)
						}
					}`,
			"package.json": dedent`
					{
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		}));
	});

	it("defaults to a workers.dev preview", async () => {
		await worker.runDevSession("--remote --ip 127.0.0.1", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toContain(`devprod-testing7928.workers.dev`);
		});
	});

	it("respects dev.host setting", async () => {
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["nodejs_compat"]

					[dev]
					host = "wrangler-testing.testing.devprod.cloudflare.dev"
			`,
		}));
		await worker.runDevSession("--remote --ip 127.0.0.1", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot(
				`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
			);
		});
	});
	it("infers host from first route", async () => {
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["nodejs_compat"]

					[[routes]]
					pattern = "wrangler-testing.testing.devprod.cloudflare.dev/*"
					zone_name = "testing.devprod.cloudflare.dev"
			`,
		}));
		await worker.runDevSession("--remote --ip 127.0.0.1", async (session) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${session.port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot(
				`"https://wrangler-testing.testing.devprod.cloudflare.dev/"`
			);
		});
	});
	it("fails with useful error message if host is not routable", async () => {
		await worker.seed((workerName) => ({
			"wrangler.toml": dedent`
					name = "${workerName}"
					main = "src/index.ts"
					compatibility_date = "2023-01-01"
					compatibility_flags = ["nodejs_compat"]

					[[routes]]
					pattern = "not-a-domain.testing.devprod.cloudflare.dev/*"
					zone_name = "testing.devprod.cloudflare.dev"
			`,
		}));
		await worker.runDevSession("--remote --ip 127.0.0.1", async (session) => {
			const { stderr } = await retry(
				(s) => !s.stderr.includes("ERROR"),
				() => {
					return { stderr: session.stderr };
				}
			);
			expect(normalizeOutput(stderr)).toMatchInlineSnapshot(`
				"X [ERROR] Could not access \`not-a-domain.testing.devprod.cloudflare.dev\`. Make sure the domain is set up to be proxied by Cloudflare.
				  For more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route"
			`);
		});
	});
});
