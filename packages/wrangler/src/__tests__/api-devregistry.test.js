import { unstable_dev } from "../api";
import { fetch } from "undici";

jest.unmock("undici");

describe("childWorker", () => {
	let helloWorldWorker;
	let childWorker;
	let parentWorker;

	beforeAll(async () => {
		helloWorldWorker = await unstable_dev(
			"src/__tests__/helpers/worker-scripts/hello-world-worker.js",
			{
				config:
					"src/__tests__/helpers/worker-scripts/hello-world-wrangler.toml",
			},
			{ disableExperimentalWarning: true }
		);
		childWorker = await unstable_dev(
			"src/__tests__/helpers/worker-scripts/hello-world-worker.js",
			{ config: "src/__tests__/helpers/worker-scripts/child-wrangler.toml" },
			{ disableExperimentalWarning: true }
		);
		parentWorker = await unstable_dev(
			"src/__tests__/helpers/worker-scripts/parent-worker.js",
			{ config: "src/__tests__/helpers/worker-scripts/parent-wrangler.toml" },
			{ disableExperimentalWarning: true }
		);
	});

	afterAll(async () => {
		await helloWorldWorker.stop();
		await childWorker.stop();
		await parentWorker.stop();
	});

	it("should return Hello World", async () => {
		const resp = await helloWorldWorker.fetch();
		if (resp) {
			const text = await resp.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);
		}
	});
	it("should spin up devRegistry", async () => {
		const resp = await fetch("http://localhost:6284/workers");
		if (resp) {
			const parsedResp = await resp.json();
			expect(parsedResp["hello-world"]).toBeTruthy();
		}
	});

	it("parentWorker and childWorker should be added devRegistry", async () => {
		const resp = await fetch("http://localhost:6284/workers");
		if (resp) {
			const parsedResp = await resp.json();
			expect(parsedResp.parent).toBeTruthy();
			expect(parsedResp.child).toBeTruthy();
		}
	});

	it("parentWorker should return Hello World by invoking the child worker", async () => {
		const resp = await parentWorker.fetch();
		if (resp) {
			const parsedResp = await resp.text();
			expect(parsedResp).toEqual(`Hello World!`);
		}
	});
});
