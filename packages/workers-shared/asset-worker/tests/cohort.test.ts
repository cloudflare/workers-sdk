import { describe, it, vi } from "vitest";
import { COHORT_LOOKUP_TIMEOUT_MS, lookupCohort } from "../src/worker";
import type { Env } from "../src/worker";
import type { AccountCohortQuerierBinding } from "../worker-configuration";

function makeEnv(
	querier?: Partial<AccountCohortQuerierBinding>
): Pick<Env, "ACCOUNT_COHORT_QUERIER"> {
	return {
		ACCOUNT_COHORT_QUERIER: querier as AccountCohortQuerierBinding | undefined,
	};
}

describe("[Asset Worker] lookupCohort", () => {
	it("calls querier with account ID as string", async ({ expect }) => {
		const lookupMock = vi.fn().mockResolvedValue({
			ok: true,
			result: "ent",
			meta: { workersVersion: "test" },
		});

		const result = await lookupCohort(
			makeEnv({ lookupAccountCohort: lookupMock }) as Env,
			42
		);

		expect(result).toBe("ent");
		expect(lookupMock).toHaveBeenCalledWith("42");
	});

	it("returns null when binding is unavailable", async ({ expect }) => {
		const result = await lookupCohort(makeEnv() as Env, 42);
		expect(result).toBeNull();
	});

	it("returns null when account ID is undefined", async ({ expect }) => {
		const lookupMock = vi.fn();
		const result = await lookupCohort(
			makeEnv({ lookupAccountCohort: lookupMock }) as Env,
			undefined
		);

		expect(result).toBeNull();
		expect(lookupMock).not.toHaveBeenCalled();
	});

	it("returns null on RPC failure", async ({ expect }) => {
		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () => {
					throw new Error("RPC unavailable");
				},
			}) as Env,
			42
		);

		expect(result).toBeNull();
	});

	it("returns null when result is ok:false", async ({ expect }) => {
		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: false as const,
						errors: [
							{ name: "Error", message: "invalid account", code: "ERR" },
						],
					}),
			}) as Env,
			42
		);

		expect(result).toBeNull();
	});

	it("returns null when result is null (cold cache)", async ({ expect }) => {
		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: null,
						meta: { workersVersion: "test" },
					}),
			}) as Env,
			42
		);

		expect(result).toBeNull();
	});

	it("returns cohort for free tier accounts", async ({ expect }) => {
		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "free",
						meta: { workersVersion: "test" },
					}),
			}) as Env,
			42
		);

		expect(result).toBe("free");
	});

	it("returns cohort for paid tier accounts", async ({ expect }) => {
		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () =>
					Promise.resolve({
						ok: true as const,
						result: "paid",
						meta: { workersVersion: "test" },
					}),
			}) as Env,
			42
		);

		expect(result).toBe("paid");
	});

	it("times out after COHORT_LOOKUP_TIMEOUT_MS", async ({ expect }) => {
		// Verify the timeout constant is set to 5ms
		expect(COHORT_LOOKUP_TIMEOUT_MS).toBe(5);

		const result = await lookupCohort(
			makeEnv({
				lookupAccountCohort: () =>
					new Promise((resolve) => {
						setTimeout(
							() =>
								resolve({
									ok: true as const,
									result: "ent",
									meta: { workersVersion: "test" },
								}),
							100
						);
					}),
			}) as Env,
			42
		);

		expect(result).toBeNull();
	});
});
