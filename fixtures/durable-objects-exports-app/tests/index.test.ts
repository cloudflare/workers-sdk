import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { unstable_startWorker } from "wrangler";

const basePath = resolve(__dirname, "..");

describe("durable objects declared via the new `exports` config", () => {
	let worker: Awaited<ReturnType<typeof unstable_startWorker>>;
	// Each test run uses a freshly named DO instance so the assertions
	// against absolute counter values aren't sensitive to persisted state
	// from previous test runs (miniflare keeps SQLite data under .wrangler/).
	const instance = randomUUID();

	beforeAll(async () => {
		// The declarative `exports` flow is gated behind `X_DO_EXPORTS` while
		// the server-side `exports_reconciliation` entitlement rolls out.
		// `unstable_startWorker` mirrors the deploy-side opt-in check, so set
		// it here for the duration of the test run.
		vi.stubEnv("X_DO_EXPORTS", "true");
		worker = await unstable_startWorker({
			config: join(basePath, "wrangler.jsonc"),
		});
	});

	afterAll(async () => {
		await worker?.dispose();
		vi.unstubAllEnvs();
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

		// CounterA should be untouched by activity on CounterB.
		response = await worker.fetch(`http://example.com/a?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 2 });
	});

	it("addresses unbound CounterC via `ctx.exports` (no binding required)", async ({
		expect,
	}) => {
		// CounterC has no entry in `durable_objects.bindings` — it's
		// declared only in `exports`. The Worker reaches it through
		// `ctx.exports.CounterC`. This is the canonical "unbound DO" recipe
		// enabled by the declarative `exports` flow.
		let response = await worker.fetch(
			`http://example.com/c?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 0 });

		response = await worker.fetch(
			`http://example.com/c/increment?instance=${instance}`
		);
		expect(await response.json()).toEqual({ value: 1 });

		// CounterC state is isolated from CounterA / CounterB.
		response = await worker.fetch(`http://example.com/a?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 2 });
		response = await worker.fetch(`http://example.com/b?instance=${instance}`);
		expect(await response.json()).toEqual({ value: 1 });
	});

	it('uses SQLite-backed storage (`storage: "sqlite"` from the `exports` map is honored in local dev)', async ({
		expect,
	}) => {
		// Each DO runs `ctx.storage.sql.exec("SELECT 1")`. The call throws
		// at runtime if the namespace was provisioned on legacy KV. All
		// three DOs (bound and unbound) are declared as
		// `storage: "sqlite"` in `exports`, so the requests should succeed.
		for (const scope of ["a", "b", "c"]) {
			const response = await worker.fetch(
				`http://example.com/${scope}/sqlite-check?instance=${instance}`
			);
			expect(await response.json()).toEqual({ ok: 1 });
		}
	});
});
