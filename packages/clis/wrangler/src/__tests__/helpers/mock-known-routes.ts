import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";

export function mockCollectKnownRoutesRequest(
	routes: { pattern: string; script: string }[]
) {
	msw.use(
		http.get(
			`*/zones/:zoneId/workers/routes`,
			() => HttpResponse.json(createFetchResult(routes)),
			{ once: true }
		)
	);
}
