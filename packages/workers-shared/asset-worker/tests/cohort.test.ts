import { describe, it, vi } from "vitest";
import { COHORT_LOOKUP_TIMEOUT_MS, lookupCohort } from "../../utils/cohort";
import type { AccountCohortQuerierBinding } from "../../utils/cohort";

describe("[Asset Worker] lookupCohort", () => {
	it("calls querier with account ID as string", async ({ expect }) => {
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

	it("returns null when result is ok:false", async ({ expect }) => {
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

	it("returns null when result is null", async ({ expect }) => {
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
