import path from "path";
import { describe, it, expect, vi } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

// TODO: add test for `experimentalLocal: true` once issue with dynamic
//  `import()` and `npx-import` resolved:
//  https://github.com/cloudflare/workers-sdk/pull/1940#issuecomment-1261166695
describe("worker in local mode", () => {
	it("should invoke the worker and exit", async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		let worker: UnstableDevWorker | undefined;
		try {
			worker = await unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{
					experimental: {
						disableExperimentalWarning: true,
						disableDevRegistry: true,
					},
				}
			);
			const resp = await worker.fetch();
			expect(resp).not.toBe(undefined);
			if (resp) {
				const text = await resp.text();

				expect(text).toMatchInlineSnapshot(`"Hello World!"`);
			}
		} finally {
			await worker?.stop();
		}
	}, 10000);

	it("should be able to stop and start the server with no warning logs", async () => {
		// Spy on all the console methods
		let logs = "";
		(["debug", "info", "log", "warn", "error"] as const).forEach((method) =>
			vi
				.spyOn(console, method)
				.mockImplementation((...args: unknown[]) => (logs += `\n${args}`))
		);

		// Spy on the std out that is written to by Miniflare 2
		vi.spyOn(process.stdout, "write").mockImplementation(
			(chunk: unknown) => ((logs += `\n${chunk}`), true)
		);

		async function startWorker() {
			return await unstable_dev(
				path.resolve(__dirname, "..", "src", "basicModule.ts"),
				{
					// We need the wrangler.toml config to specify a Worker name
					// otherwise unstable_dev will not register the worker with the DevRegistry
					config: path.resolve(__dirname, "..", "src", "wrangler.module.toml"),
					// We need debug logs because this is where the message is written if registering the worker fails.
					logLevel: "debug",
					experimental: {
						disableExperimentalWarning: true,
					},
				}
			);
		}

		let worker: UnstableDevWorker | undefined;
		try {
			worker = await startWorker();

			// Stop the worker and start it again
			await worker.stop();
			await new Promise((r) => setTimeout(r, 2000));

			worker = await startWorker();

			const resp = await worker.fetch();
			expect(resp).not.toBe(undefined);

			expect(logs).not.toMatch(
				/Failed to register worker in local service registry/
			);
		} finally {
			worker?.stop();
		}
	}, 10000);
});
