import wrangler from "wrangler";

describe("worker", () => {
	let worker: {
		fetch: (init?: RequestInit) => Promise<Response | undefined>;
		stop: () => void;
	};

	beforeAll(async () => {
		//since the script is invoked from the directory above, need to specify index.js is in src/
		worker = await wrangler.unstable_dev("src/basicModule.ts", {
			ip: "127.0.0.1",
			port: 1337,
		});
	});

	afterAll(async () => {
		worker.stop();
	});

	it("should invoke the worker and exit", async () => {
		const resp = await worker.fetch();
		expect(resp).not.toBe(undefined);
		if (resp) {
			const text = await resp.text();

			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
});
