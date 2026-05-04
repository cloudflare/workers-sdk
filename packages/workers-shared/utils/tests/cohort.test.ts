import { describe, it, vi } from "vitest";
import { COHORT_LOOKUP_TIMEOUT_MS, lookupCohort } from "../cohort";
import type { AccountCohortQuerierBinding } from "../cohort";

describe("lookupCohort", () => {
	it("returns cohort on success", async ({ expect }) => {
		const lookupMock = vi.fn().mockResolvedValue({
			ok: true,
			result: "ent",
			meta: { workersVersion: "test" },
		});

		const result = await lookupCohort(
			{ lookupAccountCohort: lookupMock } as AccountCohortQuerierBinding,
			42
		);

		expect(result).toBe("ent");
		expect(lookupMock).toHaveBeenCalledWith("42");
	});

	it("returns null when binding is unavailable", async ({ expect }) => {
		const result = await lookupCohort(undefined, 42);
		expect(result).toBeNull();
	});

	it("returns null when accountId is undefined", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "ent",
						meta: { workersVersion: "test" },
					}),
			},
			undefined
		);
		expect(result).toBeNull();
	});

	it("returns null on RPC failure", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () => Promise.reject(new Error("rpc broke")),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("returns null when ok:false", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: false as const,
						errors: [
							{ name: "Error", message: "invalid account", code: "ERR" },
						],
					}),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("returns null when result is null (cold cache)", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: null,
						meta: { workersVersion: "test" },
					}),
			},
			42
		);
		expect(result).toBeNull();
	});

	it("times out after COHORT_LOOKUP_TIMEOUT_MS", async ({ expect }) => {
		const result = await lookupCohort(
			{
				lookupAccountCohort: () =>
					new Promise((resolve) => {
						setTimeout(
							() =>
								resolve({
									ok: true as const,
									result: "ent",
									meta: { workersVersion: "test" },
								}),
							COHORT_LOOKUP_TIMEOUT_MS * 2
						);
					}),
			},
			42
		);
		expect(result).toBeNull();
	});
});
