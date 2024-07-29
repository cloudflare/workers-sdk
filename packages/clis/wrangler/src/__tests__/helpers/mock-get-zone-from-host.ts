import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";

export function mockGetZoneFromHostRequest(host: string, zone?: string) {
	msw.use(
		http.get("*/zones", ({ request }) => {
			const url = new URL(request.url);

			expect(url.searchParams.get("name")).toEqual(host);
			return HttpResponse.json(createFetchResult(zone ? [{ id: zone }] : []));
		})
	);
}
