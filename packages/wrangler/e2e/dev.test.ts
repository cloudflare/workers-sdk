import crypto from "node:crypto";
import path from "node:path";
import getPort from "get-port";
import shellac from "shellac";
import { fetch } from "undici";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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
		const bg = await shellac.in(workerPath).env(process.env).bg`
			exits {
				$$ ${WRANGLER} dev ${flags} --port ${port}
			}
		`;
		pid = bg.pid;
		await session(port);
		return bg.promise;
	} finally {
		if (pid) process.kill(pid);
	}
}

describe("basic dev tests", () => {
	let workerName: string;
	let workerPath: string;

	beforeAll(async () => {
		const root = await makeRoot();
		workerName = `smoke-test-worker-${crypto.randomBytes(4).toString("hex")}`;
		workerPath = path.join(root, workerName);
	});

	beforeEach(async () => {
		await seed(workerPath, {
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
						"name": "${workerName}",
						"version": "0.0.0",
						"private": true
					}
					`,
		});
	});

	it("can modify worker during dev session (local)", async () => {
		await runDevSession(workerPath, "", async (port) => {
			await retry(() =>
				expect(
					fetch(`http://127.0.0.1:${port}`).then((r) => r.text())
				).resolves.toMatchInlineSnapshot('"Hello World!"')
			);

			await seed(workerPath, {
				"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Updated Worker!")
							}
						}`,
			});
			await retry(() =>
				expect(
					fetch(`http://127.0.0.1:${port}`).then((r) => r.text())
				).resolves.toMatchInlineSnapshot('"Updated Worker!"')
			);
		});
	});

	it("can modify worker during dev session (remote)", async () => {
		await runDevSession(workerPath, "--remote --ip 127.0.0.1", async (port) => {
			await retry(() =>
				expect(
					fetch(`http://127.0.0.1:${port}`).then((r) => r.text())
				).resolves.toMatchInlineSnapshot('"Hello World!"')
			);
			await seed(workerPath, {
				"src/index.ts": dedent`
						export default {
							fetch(request) {
								return new Response("Updated Worker!")
							}
						}`,
			});
			await retry(() =>
				expect(
					fetch(`http://127.0.0.1:${port}`).then((r) => r.text())
				).resolves.toMatchInlineSnapshot('"Updated Worker!"')
			);
		});
	});
});
