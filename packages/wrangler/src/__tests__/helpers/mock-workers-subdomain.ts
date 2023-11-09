import { rest } from "msw";

import { createFetchResult, msw } from "./msw";

/** Create a mock handler for the request to get the account's subdomain. */
export function mockSubDomainRequest(
	subdomain = "test-sub-domain",
	registeredWorkersDev = true
) {
	if (registeredWorkersDev) {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(ctx.json(createFetchResult({ subdomain })));
			})
		);
	} else {
		msw.use(
			rest.get("*/accounts/:accountId/workers/subdomain", (req, res, ctx) => {
				return res.once(
					ctx.json(
						createFetchResult(null, false, [
							{ code: 10007, message: "haven't registered workers.dev" },
						])
					)
				);
			})
		);
	}
}
