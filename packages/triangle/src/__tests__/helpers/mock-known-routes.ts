import { rest } from "msw";
import { createFetchResult, msw } from "./msw";

export function mockCollectKnownRoutesRequest(
	routes: { pattern: string; script: string }[]
) {
	msw.use(
		rest.get(`*/zones/:zoneId/workers/routes`, (_, res, ctx) =>
			res.once(ctx.json(createFetchResult(routes)))
		)
	);
}
