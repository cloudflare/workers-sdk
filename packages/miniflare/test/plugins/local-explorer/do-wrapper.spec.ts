import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, test } from "vitest";
import { disposeWithRetry } from "../../test-shared";

const TEST_SCRIPT = `
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class TestDO extends DurableObject {
	count = 0;

	async fetch(request) {
		return new Response("fetch-ok");
	}

	increment(by = 1) {
		this.count += by;
		return this.count;
	}

	get currentCount() {
		return this.count;
	}

	async storeAndRetrieve(key, value) {
		await this.ctx.storage.put(key, value);
		return await this.ctx.storage.get(key);
	}

	getClassName() {
		return this.constructor.name;
	}
}

export class TestEntrypoint extends WorkerEntrypoint {
	async fetch(request) {
		const url = new URL(request.url);
		const action = url.pathname.slice(1);
		const stub = this.env.TEST_DO.get(this.env.TEST_DO.idFromName("test"));

		switch (action) {
			case "fetch":
				return stub.fetch(request);
			case "increment":
				return Response.json({ result: await stub.increment(5) });
			case "getter":
				return Response.json({ result: await stub.currentCount });
			case "storage":
				return Response.json({ result: await stub.storeAndRetrieve("key", "value") });
			case "class-name":
				return Response.json({ result: await stub.getClassName() });
			default:
				return new Response("not found", { status: 404 });
		}
	}
}

export default TestEntrypoint;
`;

describe("Durable Object Wrapper", () => {
	// Run the same tests with wrapper enabled and disabled
	// to prove the wrapper doesn't change observable DO behavior
	describe.each([
		{ localExplorer: true, label: "enabled" },
		{ localExplorer: false, label: "disabled" },
	])("with unsafeLocalExplorer $label", ({ localExplorer }) => {
		let mf: Miniflare;

		beforeAll(async () => {
			mf = new Miniflare({
				compatibilityDate: "2024-04-03",
				compatibilityFlags: ["nodejs_compat"],
				modules: true,
				script: TEST_SCRIPT,
				unsafeLocalExplorer: localExplorer,
				durableObjects: {
					TEST_DO: "TestDO",
				},
			});
		});

		afterAll(() => disposeWithRetry(mf));

		test("fetch handler works", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/fetch");
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("fetch-ok");
		});

		test("RPC method works", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/increment");
			const data = (await res.json()) as { result: number };
			expect(data.result).toBe(5);
		});

		test("RPC getter works", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/getter");
			const data = (await res.json()) as { result: number };
			expect(data.result).toBe(5);
		});

		test("storage operations work", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/storage");
			const data = (await res.json()) as { result: string };
			expect(data.result).toBe("value");
		});

		test("class name is preserved", async ({ expect }) => {
			const res = await mf.dispatchFetch("http://localhost/class-name");
			const data = (await res.json()) as { result: string };
			expect(data.result).toBe("TestDO");
		});
	});
});
