import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { msw } from "./msw";
import type { RequestHandlerOptions } from "msw";

export function mockGetZoneWorkerRoutesMulti(
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
	zoneId: string,
	routes: { pattern: string; script: string }[] = [],
	options: RequestHandlerOptions = {}
) {
	return mockGetZoneWorkerRoutesMulti({ [zoneId]: routes }, options);
}
