import { rest } from "msw";
import { assert } from "vitest";
import { createFetchResult, msw } from "./msw";

export function mockGetZoneFromHostRequest(host: string, zone?: string) {
	msw.use(
		rest.get("*/zones", (req, res, ctx) => {
			assert(req.url.searchParams.get("name") == host);
			return res(ctx.json(createFetchResult(zone ? [{ id: zone }] : [])));
		})
	);
}
