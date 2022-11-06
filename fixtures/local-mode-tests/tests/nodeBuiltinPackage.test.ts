import { unstable_dev } from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
		stop: () => Promise<void>;
	};

	beforeAll(async () => {
		worker = await unstable_dev("src/nodeBuiltinPackage.ts", {
			disableExperimentalWarning: true,
		});
	});

	afterAll(async () => {
		await worker.stop();
	});

	it("returns hex string", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);

		const text = await resp.text();
		expect(text).toMatch("68656c6c6f");
	});
});
