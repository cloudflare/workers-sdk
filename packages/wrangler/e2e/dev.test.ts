import assert from "node:assert";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeEach, describe, expect, it } from "vitest";
import { retry } from "./helpers/retry";
import { dedent, makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";
import { normalizeOutput } from "./helpers/normalize";

type MaybePromise<T = void> = T | Promise<T>;

const waitForPortToBeBound = async (port: number) => {
	await retry(
		(s) => false, // only retry if promise below rejects (network error)
		() => fetch(`http://127.0.0.1:${port}`)
	);
};

const waitUntil = async (
	predicate: () => MaybePromise<boolean>,
	intervalMs = 100
) => {
	await retry(
		(result) => !result,
		async () => {
			await setTimeout(intervalMs);
			return predicate();
		}
	);
};

interface Session {
	port: number;
	stdout: string;
	stderr: string;
}

async function runDevSession(
	workerPath: string,
	flags: string,
	session: (session: Session) => MaybePromise
) {
	let pid;
	let bg: Awaited<ReturnType<typeof shellac.bg>> | undefined;
	try {
		let port: number;
		if (!flags.includes("--port")) {
			port = await getPort();
			flags += ` --port ${port}`;
		} else {
			port = parseInt(flags.match(/--port (\d+)/)![1]);

			if (port === 0) port = await getPort();
		}

		// Must use the `in` statement in the shellac script rather than `.in()` modifier on the `shellac` object
		// otherwise the working directory does not get picked up.
		bg = await shellac.env(process.env).bg`
		in ${workerPath} {
			exits {
        $ ${WRANGLER} dev ${flags}
			}
		}
			`;
		pid = bg.pid;

		// sessionData is a mutable object where stdout/stderr update
		const sessionData: Session = {
			port,
			stdout: "",
			stderr: "",
		};
		bg.process.stdout.on(
			"data",
			(chunk) => console.log(chunk.toString()) || (sessionData.stdout += chunk)
		);
		bg.process.stderr.on("data", (chunk) => (sessionData.stderr += chunk));

		await session(sessionData);

		return bg.promise;
	} finally {
		// bg?.process.kill("SIGINT");
		if (pid) process.kill(pid, "SIGINT");
		await setTimeout(1000);
		// bg?.process.kill();
		if (pid) process.kill(pid);
	}
}

type DevWorker = {
	workerName: string;
	workerPath: string;
	runDevSession: (
		flags: string,
		session: (session: Session) => MaybePromise
	) => ReturnType<typeof runDevSession>;
	seed: (
		seeder: ((name: string) => Record<string, string>) | Record<string, string>
	) => ReturnType<typeof seed>;
};
async function makeWorker(): Promise<DevWorker> {
	const root = await makeRoot();
	const workerName = `smoke-test-worker-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);

	return {
		workerName,
		workerPath,
		runDevSession: (
			flags: string,
			session: (session: Session) => MaybePromise
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
						export default {
							fetch(request, env) {
								return new Response("Updated Worker! " + env.KEY)
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
		let normalize = (text: string) => text;

		const final = await a.runDevSession(
			"--log-level debug",
			async (session) => {
				normalize = (text: string) =>
					normalizeOutput(text, { [session.port]: "<PORT>" });

				await waitForPortToBeBound(session.port);
			}
		);

		// await waitUntil(() => final.stdout.includes("🐛"));

		expect(normalize(final.stdout)).toMatchInlineSnapshot(`
			"⎔ Starting local server...
			[mf:inf] Ready on http://0.0.0.0:<PORT>
			[mf:inf] - http://127.0.0.1:<PORT>
			[mf:inf] - http://127.0.2.2:<PORT>
			[mf:inf] - http://127.0.2.3:<PORT>
			[mf:inf] - http://192.168.1.143:<PORT>
			[mf:inf] - http://192.168.1.195:<PORT>
			[mf:inf] GET / 200 OK (TIMINGS)
			"
		`);
		expect(normalize(final.stderr)).toMatchInlineSnapshot(`
			"X [ERROR] workerd/server/server.c++:2984: info: Inspector is listening
			X [ERROR] workerd/server/server.c++:1174: info: Inspector client attaching [core:user:a]
			"
		`);

		const filepath = final.stdout.match(
			/🐛 Writing debug logs to "(.+\.log)"/
		)?.[1];
		assert(filepath);

		expect(existsSync(filepath)).toBe(true);
	});

	it("does NOT write to file when --log-level != debug", async () => {
		let normalize = (text: string) => text;

		const final = await a.runDevSession("", async (session) => {
			normalize = (text: string) =>
				normalizeOutput(text, { [session.port]: "<PORT>" });

			await waitForPortToBeBound(session.port);
		});

		const filepath = final.stdout.match(
			/🐛 Writing debug logs to "(.+\.log)"/
		)?.[1];

		expect(filepath).toBeUndefined();

		expect(normalize(final.stdout)).toMatchInlineSnapshot(`
			"⎔ Starting local server...
			[mf:inf] Ready on http://0.0.0.0:<PORT>
			[mf:inf] - http://127.0.0.1:<PORT>
			[mf:inf] - http://127.0.2.2:<PORT>
			[mf:inf] - http://127.0.2.3:<PORT>
			[mf:inf] - http://192.168.1.143:<PORT>
			[mf:inf] - http://192.168.1.195:<PORT>
			[mf:inf] GET / 200 OK (TIMINGS)
			"
		`);
		expect(normalize(final.stderr)).toMatchInlineSnapshot('""');
	});

	it("rewrites address-in-use error logs", async () => {
		// 1. start worker A on a (any) port
		await a.runDevSession("", async (sessionA) => {
			const normalize = (text: string) =>
				normalizeOutput(text, { [sessionA.port]: "<PORT>" });

			// 2. wait until worker A is bound to its port
			await waitForPortToBeBound(sessionA.port);

			// 3. try to start worker B on the same port
			await b.runDevSession(`--port ${sessionA.port}`, async (sessionB) => {
				// 4. wait until session B emits an "Address in use" error log
				await waitUntil(() =>
					normalize(sessionB.stderr).includes(
						"[ERROR] Address (0.0.0.0:<PORT>) already in use."
					)
				);

				// snapshot stdout/stderr so we can see what the user sees
				expect(normalize(sessionB.stdout)).toMatchInlineSnapshot(`
						"⎔ Starting local server...
						"
					`);
				expect(normalize(sessionB.stderr)).toMatchInlineSnapshot(`
						"X [ERROR] Address (0.0.0.0:<PORT>) already in use. Please check that you are not already running a server on this address or specify a different port with --port.
						X [ERROR] MiniflareCoreError [ERR_RUNTIME_FAILURE]: The Workers runtime failed to start. There is likely additional logging output above.
						"
					`);

				// ensure the workerd error message IS NOT present
				expect(normalize(sessionB.stderr)).not.toContain(
					"Address already in use; toString() = "
				);
				// ensure th wrangler (nicer) error message IS present
				expect(normalize(sessionB.stderr)).toContain(
					"[ERROR] Address (0.0.0.0:<PORT>) already in use."
				);
			});
		});
	});
});
