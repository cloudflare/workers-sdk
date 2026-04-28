import { http, HttpResponse } from "msw";
import { msw } from "./msw";
import type { RequestHandlerOptions } from "msw";
import type { ExpectStatic } from "vitest";

export function mockGetZoneWorkerRoutesMulti(
	expect: ExpectStatic,
	zones: {
		[zoneId: string]: { pattern: string; script: string }[];
	},
	options: RequestHandlerOptions = {}
) {
	msw.use(
		http.get<{ zoneId: string }>(
			"*/zones/:zoneId/workers/routes",
			({ params }) => {
				expect(Object.keys(zones)).toContain(params.zoneId);
				const routes = zones[params.zoneId] ?? [];
				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: routes,
					},
					{ status: 200 }
				);
			},
			options
		)
	);
}

export function mockGetZoneWorkerRoutes(
	expect: ExpectStatic,
	zoneId: string,
	routes: { pattern: string; script: string }[] = [],
	options: RequestHandlerOptions = {}
) {
	return mockGetZoneWorkerRoutesMulti(expect, { [zoneId]: routes }, options);
}
