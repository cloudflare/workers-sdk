import { rest } from "msw";
import { msw, createFetchResult } from "./msw";

export function mockGetZoneFromHostRequest(host: string, zone?: string) {
	msw.use(
		rest.get("*/zones", (req, res, ctx) => {
			expect(req.url.searchParams.get("name")).toEqual(host);
			return res(ctx.json(createFetchResult(zone ? [{ id: zone }] : [])));
		})
	);
}
