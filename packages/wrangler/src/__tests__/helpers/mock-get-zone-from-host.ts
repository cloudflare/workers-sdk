import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { msw } from "./msw";
import type { RequestHandlerOptions } from "msw";

export function mockGetZonesMulti(
	domains: {
		[domain: string]: { accountId: string; zones: { id: string }[] };
	} = {},
	options: RequestHandlerOptions = {}
) {
	msw.use(
		http.get(
			"*/zones",
			({ request }) => {
				const url = new URL(request.url);
				const reqName = url.searchParams.get("name") || "";
				const reqAccountId = url.searchParams.get("account.id") || "";
				expect(reqName).not.toEqual("");
				expect(reqAccountId).not.toEqual("");

				expect(Object.keys(domains)).toContain(reqName);
				const domain = domains[reqName];
				expect(domain.accountId).toEqual(reqAccountId);
				const zones = domain.zones;

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: zones,
					},
					{ status: 200 }
				);
			},
			options
		)
	);
}

export function mockGetZones(
	domain: string,
	zones: { id: string }[] = [],
	accountId = "some-account-id",
	options: RequestHandlerOptions = {}
) {
	return mockGetZonesMulti(
		{
			[domain]: { accountId, zones },
		},
		options
	);
}
