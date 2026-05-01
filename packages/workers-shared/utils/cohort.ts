/**
 * Minimal RPC binding type for the AccountCohortQuerier entrypoint
 * in the account-services worker. Replace with the published type from
 * `@cloudflare/workers-toolbox-types` once available with bundled deps.
 */
export interface AccountCohortQuerierBinding {
	lookupAccountCohort(accountID: string): Promise<
		| { ok: true; result: string | null; meta: { workersVersion: string } }
		| {
				ok: false;
				errors: Array<{ name: string; message: string; code: string }>;
		  }
	>;
}

export const COHORT_LOOKUP_TIMEOUT_MS = 5;

/**
 * Resolves the deployment cohort for a customer account via the
 * AccountCohortQuerier RPC binding. Returns null when the binding is
 * unavailable, the RPC fails, times out, or the cohort is undetermined
 * (cold cache). Intentionally fails open — a null cohort means the
 * request runs under default routing.
 */
export async function lookupCohort(
	querier: AccountCohortQuerierBinding | undefined,
	accountId: number | undefined
): Promise<string | null> {
	if (!querier || !accountId) {
		return null;
	}
	const ac = new AbortController();
	try {
		const rpc = querier.lookupAccountCohort(accountId.toString());
		// Prevent unhandled rejection if timeout wins but RPC later rejects.
		void rpc.catch(() => {});
		const timeout = new Promise<never>((_, reject) => {
			const id = setTimeout(() => {
				reject(new Error("cohort lookup timed out"));
			}, COHORT_LOOKUP_TIMEOUT_MS);
			ac.signal.addEventListener("abort", () => clearTimeout(id));
		});
		const res = await Promise.race([rpc, timeout]);
		if (!res.ok) {
			console.error("cohort lookup failed", res.errors);
			return null;
		}
		return res.result ?? null;
	} catch (e: unknown) {
		console.error("cohort lookup failed", e);
		return null;
	} finally {
		ac.abort();
	}
}
