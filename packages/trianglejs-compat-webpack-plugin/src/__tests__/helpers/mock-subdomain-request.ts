import {
	createFetchResult,
	setMockRawResponse,
	setMockResponse,
} from "wrangler/src/__tests__/helpers/mock-cfetch";

/** Create a mock handler for the request to get the account's subdomain. */
export function mockSubDomainRequest(
	subdomain = "test-sub-domain",
	registeredWorkersDev = true
) {
	if (registeredWorkersDev) {
		setMockResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
			return { subdomain };
		});
	} else {
		setMockRawResponse("/accounts/:accountId/workers/subdomain", "GET", () => {
			return createFetchResult(null, false, [
				{ code: 10007, message: "haven't registered workers.dev" },
			]);
		});
	}
}
