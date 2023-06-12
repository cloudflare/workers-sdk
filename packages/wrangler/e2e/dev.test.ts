import crypto from "node:crypto";
import path from "node:path";
import getPort from "get-port";
import { fetch } from "undici";
import { beforeEach, describe, expect, it } from "vitest";
import { retry } from "./helpers/retry";
import { RUN, runInBg } from "./helpers/run";
import { dedent, makeRoot, seed } from "./helpers/setup";

async function runDevSession(
	workerName: string,
	workerPath: string,
	flags: string,
	session: (port: number) => Promise<void>
) {
	let pid;
	let promise;
	try {
		const port = await getPort();
		const bg = await runInBg(workerPath, {
			[workerName]: "smoke-test-worker",
			[`http://127.0.0.1:${port}`]: "http://127.0.0.1:PORT",
		})`
	in ${workerPath} {
		exits {
			$$ ${RUN} dev ${flags} --port ${port}
		}
	}
`;
		pid = bg.pid;
		promise = bg.promise;
		await session(port);
	} finally {
		if (pid) process.kill(pid);
	}
	return await promise;
}

describe("basic dev tests", async () => {
	const root = await makeRoot();
	const workerName = `smoke-test-worker-${crypto
		.randomBytes(4)
		.toString("hex")}`;
	const workerPath = path.join(root, workerName);

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
		await runDevSession(workerName, workerPath, "", async (port) => {
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
		await runDevSession(
			workerName,
			workerPath,
			"--remote --ip 127.0.0.1",
			async (port) => {
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
			}
		);
	});
});
