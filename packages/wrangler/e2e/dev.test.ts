import crypto from "node:crypto";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeEach, describe, expect, it } from "vitest";
import { retry } from "./helpers/retry";
import { dedent, makeRoot, seed } from "./helpers/setup";
import { WRANGLER } from "./helpers/wrangler-command";

async function runDevSession(
	workerPath: string,
	flags: string,
	session: (port: number) => Promise<void>
) {
	let pid;
	try {
		const port = await getPort();
		// Must use the `in` statement in the shellac script rather than `.in()` modifier on the `shellac` object
		// otherwise the working directory does not get picked up.
		const bg = await shellac.env(process.env).bg`
		in ${workerPath} {
			exits {
				$ ${WRANGLER} dev ${flags} --port ${port}
			}
		}
			`;
		pid = bg.pid;
		await session(port);
		return bg.promise;
	} finally {
		if (pid) process.kill(pid);
	}
}

type DevWorker = {
	workerName: string;
	workerPath: string;
	runDevSession: (
		flags: string,
		session: (port: number) => Promise<void>
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
		runDevSession: (flags: string, session: (port: number) => Promise<void>) =>
			runDevSession(workerPath, flags, session),
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
		await worker.runDevSession("", async (port) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
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
					const r = await fetch(`http://127.0.0.1:${port}`);
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
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text3).toMatchInlineSnapshot('"Updated Worker! updated"');
		});
	});

	it("can modify worker during dev session (remote)", async () => {
		await worker.runDevSession("--remote --ip 127.0.0.1", async (port) => {
			const { text } = await retry(
				(s) => s.status !== 200 || s.text === "",
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
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
					const r = await fetch(`http://127.0.0.1:${port}`);
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
		await b.runDevSession("", async (bPort) => {
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${bPort}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"hello world"');
		});
	});

	it("can fetch b through a (start b, start a)", async () => {
		await b.runDevSession("", async () => {
			await a.runDevSession("", async (aPort) => {
				const { text } = await retry(
					(s) => s.status !== 200,
					async () => {
						const r = await fetch(`http://127.0.0.1:${aPort}`);
						return { text: await r.text(), status: r.status };
					}
				);
				expect(text).toMatchInlineSnapshot('"hello world"');
			});
		});
	});
	it("can fetch b through a (start a, start b)", async () => {
		await a.runDevSession("", async (aPort) => {
			await b.runDevSession("", async () => {
				const { text } = await retry(
					(s) => s.status !== 200,
					async () => {
						const r = await fetch(`http://127.0.0.1:${aPort}`);
						return { text: await r.text(), status: r.status };
					}
				);
				expect(text).toMatchInlineSnapshot('"hello world"');
			});
		});
	});
});
