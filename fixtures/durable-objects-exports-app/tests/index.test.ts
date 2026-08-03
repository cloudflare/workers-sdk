import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, it } from "vitest";
import { unstable_startWorker } from "wrangler";

const basePath = resolve(__dirname, "..");

describe("durable objects declared via the new `exports` config", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;
	const instance = randomUUID();

	beforeAll(async () => {
		worker = await unstable_startWorker({
			config: join(basePath, "wrangler.jsonc"),
		});
	});

	afterAll(async () => {
		await worker?.dispose();
	});

	it("starts CounterA at 0 and increments it via SQLite-backed storage", async ({
		expect,
	}) => {
		let response = await worker.fetch(
			`http://example.com/a?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 0 });

		response = await worker.fetch(
			`http://example.com/a/increment?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 1 });

		response = await worker.fetch(
			`http://example.com/a/increment?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 2 });
	});

	it("keeps CounterB independent of CounterA", async ({ expect }) => {
		let response = await worker.fetch(
			`http://example.com/b?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 0 });

		response = await worker.fetch(
			`http://example.com/b/increment?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 1 });

		response = await worker.fetch(`http://example.com/a?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 2 });
	});

	it("addresses unbound CounterC via `ctx.exports` (no binding required)", async ({
		expect,
	}) => {
		let response = await worker.fetch(
			`http://example.com/c?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 0 });

		response = await worker.fetch(
			`http://example.com/c/increment?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 1 });

		response = await worker.fetch(`http://example.com/a?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 2 });
		response = await worker.fetch(`http://example.com/b?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 1 });
	});

	it('uses SQLite-backed storage (`storage: "sqlite"` from the `exports` map is honored in local dev)', async ({
		expect,
	}) => {
		for (const scope of ["a", "b", "c"]) {
			const response = await worker.fetch(
				`http://example.com/${scope}/sqlite-check?instance=${instance}`
			);
			expect(await response.json()).toEqual({ ok: 1 });
		}
	});
});
