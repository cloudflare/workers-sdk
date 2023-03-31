import { fetch } from "undici";
import { unstable_dev } from "../api";

jest.unmock("undici");

/**
 * a huge caveat to how testing multi-worker scripts works:
 * you can't shutdown the first worker you spun up, or it'll kill the devRegistry
 */
describe("multi-worker testing", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let childWorker: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let parentWorker: any;

	beforeAll(async () => {
		childWorker = await unstable_dev(
			"src/__tests__/helpers/worker-scripts/hello-world-worker.js",
			{
				config: "src/__tests__/helpers/worker-scripts/child-wrangler.toml",
				experimental: {
					disableExperimentalWarning: true,
				},
			}
		);
		parentWorker = await unstable_dev(
			"src/__tests__/helpers/worker-scripts/parent-worker.js",
			{
				config: "src/__tests__/helpers/worker-scripts/parent-wrangler.toml",
				experimental: {
					disableExperimentalWarning: true,
				},
			}
		);
	});

	afterAll(async () => {
		await childWorker.stop();
		await parentWorker.stop();
	});

	it("parentWorker and childWorker should be added devRegistry", async () => {
		const resp = await fetch("http://localhost:6284/workers");
		if (resp) {
			const parsedResp = (await resp.json()) as {
				parent: unknown;
				child: unknown;
			};
			expect(parsedResp.parent).toBeTruthy();
			expect(parsedResp.child).toBeTruthy();
		}
	});

	it("childWorker should return Hello World itself", async () => {
		const resp = await childWorker.fetch();
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});

	it("parentWorker should return Hello World by invoking the child worker", async () => {
		const resp = await parentWorker.fetch();
		if (resp) {
			const parsedResp = await resp.text();
			expect(parsedResp).toEqual("Parent worker sees: Hello World!");
		}
	});

	it("should be able to stop and start the server with no warning logs", async () => {
		// Spy on all the console methods
		let logs = "";
		(["debug", "info", "log", "warn", "error"] as const).forEach((method) =>
			jest
				.spyOn(console, method)
				.mockImplementation((...args: unknown[]) => (logs += `\n${args}`))
		);

		// Spy on the std out that is written to by Miniflare 2
		jest
			.spyOn(process.stdout, "write")
			.mockImplementation((chunk: unknown) => ((logs += `\n${chunk}`), true));

		async function startWorker() {
			return await unstable_dev(
				"src/__tests__/helpers/worker-scripts/hello-world-worker.js",
				{
					// We need the wrangler.toml config to specify a Worker name
					// otherwise unstable_dev will not register the worker with the DevRegistry
					config: "src/__tests__/helpers/worker-scripts/child-wrangler.toml",
					// We need debug logs because this is where the message is written if registering the worker fails.
					logLevel: "debug",
					experimental: {
						disableExperimentalWarning: true,
					},
				}
			);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let worker: any;
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
			await worker?.stop();
		}
	}, 10000);
});
