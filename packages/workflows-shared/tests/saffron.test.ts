import { env } from "cloudflare:workers";
import { describe, it } from "vitest";

describe("saffron binding", () => {
	it("computes the next occurrence strictly after the seed", async ({
		expect,
	}) => {
		const seed = Date.parse("2025-01-01T00:00:30.000Z");
		const res = await env.SAFFRON.next_cron_occurrences({
			expressions: ["* * * * *"],
			count: 1,
			seed,
		});
		expect(res.valid).toBe(true);
		expect(res.next_occurrences?.[0]).toBe(
			Date.parse("2025-01-01T00:01:00.000Z")
		);
	});

	it("reports invalid expressions", async ({ expect }) => {
		const res = await env.SAFFRON.next_cron_occurrences({
			expressions: ["not a cron"],
			count: 1,
		});
		expect(res.valid).toBe(false);
	});

	it("returns multiple ascending occurrences when count > 1", async ({
		expect,
	}) => {
		const seed = Date.parse("2025-01-01T00:00:30.000Z");
		const res = await env.SAFFRON.next_cron_occurrences({
			expressions: ["* * * * *"],
			count: 3,
			seed,
		});
		expect(res.valid).toBe(true);
		expect(res.next_occurrences).toEqual([
			Date.parse("2025-01-01T00:01:00.000Z"),
			Date.parse("2025-01-01T00:02:00.000Z"),
			Date.parse("2025-01-01T00:03:00.000Z"),
		]);
	});

	it("merges occurrences across expressions and returns them sorted", async ({
		expect,
	}) => {
		const seed = Date.parse("2025-01-01T00:05:00.000Z");
		const res = await env.SAFFRON.next_cron_occurrences({
			// The two expressions' next occurrences interleave; output must be sorted.
			expressions: ["*/30 * * * *", "*/20 * * * *"],
			count: 2,
			seed,
		});
		expect(res.valid).toBe(true);
		expect(res.next_occurrences).toEqual([
			Date.parse("2025-01-01T00:20:00.000Z"),
			Date.parse("2025-01-01T00:30:00.000Z"),
		]);
	});

	it("fails the whole batch when any expression is invalid", async ({
		expect,
	}) => {
		const res = await env.SAFFRON.next_cron_occurrences({
			expressions: ["* * * * *", "not a cron"],
			count: 1,
		});
		expect(res.valid).toBe(false);
		expect(res.errors?.map((e) => e.expression)).toContain("not a cron");
		expect(res.next_occurrences).toBeUndefined();
	});
});
