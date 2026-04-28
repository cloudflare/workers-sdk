import { http, HttpResponse } from "msw";
import { msw } from "./msw";
import type { RequestHandlerOptions } from "msw";
import type { ExpectStatic } from "vitest";

export function mockGetZonesMulti(
	expect: ExpectStatic,
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
	expect: ExpectStatic,
	domain: string,
	zones: { id: string }[] = [],
	accountId = "some-account-id",
	options: RequestHandlerOptions = {}
) {
	return mockGetZonesMulti(
		expect,
		{
			[domain]: { accountId, zones },
		},
		options
	);
}
