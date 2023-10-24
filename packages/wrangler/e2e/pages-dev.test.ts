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
				$ ${WRANGLER} pages dev ${flags} --port ${port}
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

describe("pages dev tests", () => {
	let workerName: string;
	let workerPath: string;

	beforeEach(async () => {
		const root = await makeRoot();
		workerName = `smoke-test-worker-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
		await seed(workerPath, {
			"package.json": dedent`
					{
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
	});

	it("can modify worker during dev session (_worker)", async () => {
		await runDevSession(workerPath, ".", async (port) => {
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Hello World!")
							}
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
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
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
	});

	it("can modify worker during dev session (function)", async () => {
		await runDevSession(workerPath, ".", async (port) => {
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Hello World!")
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');

			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
						}`,
			});

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

	it("can recover from syntax error during dev session (_worker)", async () => {
		const out = await runDevSession(workerPath, ".", async (port) => {
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Hello World!")
							}
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
							} // Syntax Error
							}
						}`,
			});

			// Make sure the syntax error above is picked up
			await setTimeout(5_000);

			// And then make sure Wrangler hasn't crashed
			await seed(workerPath, {
				"_worker.js": dedent`
						export default {
							fetch(request, env) {
								return new Response("Updated Worker!")
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
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
		expect(out.stderr).toContain("Failed to bundle");
	});
	it("can recover from syntax error during dev session (function)", async () => {
		const out = await runDevSession(workerPath, ".", async (port) => {
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Hello World!")
						}`,
			});
			const { text } = await retry(
				(s) => s.status !== 200,
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text).toMatchInlineSnapshot('"Hello World!"');
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
							} // Syntax Error
						}`,
			});

			// Make sure the syntax error above is picked up
			await setTimeout(5_000);

			// And then make sure Wrangler hasn't crashed
			await seed(workerPath, {
				"functions/_middleware.js": dedent`
						export async function onRequest() {
							return new Response("Updated Worker!")
						}`,
			});

			const { text: text2 } = await retry(
				(s) => s.status !== 200 || s.text === "Hello World!",
				async () => {
					const r = await fetch(`http://127.0.0.1:${port}`);
					return { text: await r.text(), status: r.status };
				}
			);
			expect(text2).toMatchInlineSnapshot('"Updated Worker!"');
		});
		expect(out.stderr).toContain(
			"Unexpected error building Functions directory"
		);
	});
});
