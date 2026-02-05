import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses .each */
import { describe, expect, test } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { getHostFromUrl, getZoneForRoute } from "../zones";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { msw } from "./helpers/msw";

function mockGetZones(
	domain: string,
	zones: { id: string }[] = [],
	accountId = "some-account-id"
) {
	msw.use(
		http.get(
			"*/zones",
			({ request }) => {
				const url = new URL(request.url);

				expect([...url.searchParams.entries()]).toEqual([
					["name", domain],
					["account.id", accountId],
				]);

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
			{ once: true }
		)
	);
}

describe("Zones", () => {
	mockAccountId();
	mockApiToken();
	describe("getHostFromUrl", () => {
		test.each`
			pattern                                             | host
			${"rootdomain.com"}                                 | ${"rootdomain.com"}
			${"*.subdomain.com"}                                | ${"subdomain.com"}
			${"*rootdomain-or-subdomain.com"}                   | ${"rootdomain-or-subdomain.com"}
			${"rootdomain.com/path/name"}                       | ${"rootdomain.com"}
			${"*.subdomain.com/path/name"}                      | ${"subdomain.com"}
			${"*rootdomain-or-subdomain.com/path/name"}         | ${"rootdomain-or-subdomain.com"}
			${"*/path/name"}                                    | ${undefined}
			${"invalid:host"}                                   | ${undefined}
			${"invalid:host/path/name"}                         | ${undefined}
			${"http://rootdomain.com"}                          | ${"rootdomain.com"}
			${"http://*.subdomain.com"}                         | ${"subdomain.com"}
			${"http://*rootdomain-or-subdomain.com"}            | ${"rootdomain-or-subdomain.com"}
			${"http://rootdomain.com/path/name"}                | ${"rootdomain.com"}
			${"http://*.subdomain.com/path/name"}               | ${"subdomain.com"}
			${"http://*rootdomain-or-subdomain.com/path/name"}  | ${"rootdomain-or-subdomain.com"}
			${"http://*/path/name"}                             | ${undefined}
			${"http://invalid:host"}                            | ${undefined}
			${"http://invalid:host/path/name"}                  | ${undefined}
			${"https://rootdomain.com"}                         | ${"rootdomain.com"}
			${"https://*.subdomain.com"}                        | ${"subdomain.com"}
			${"https://*rootdomain-or-subdomain.com"}           | ${"rootdomain-or-subdomain.com"}
			${"https://rootdomain.com/path/name"}               | ${"rootdomain.com"}
			${"https://*.subdomain.com/path/name"}              | ${"subdomain.com"}
			${"https://*rootdomain-or-subdomain.com/path/name"} | ${"rootdomain-or-subdomain.com"}
			${"https://*/path/name"}                            | ${undefined}
			${"https://invalid:host"}                           | ${undefined}
			${"https://invalid:host/path/name"}                 | ${undefined}
		`("$pattern --> $host", ({ pattern, host }) => {
			expect(getHostFromUrl(pattern)).toBe(host);
		});
	});
	describe("getZoneForRoute", () => {
		test("string route", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: "example.com/*",
					accountId: "some-account-id",
				})
			).toEqual({
				host: "example.com",
				id: "example-id",
			});
		});

		test("string route (not a zone)", async () => {
			mockGetZones("wrong.com", []);
			await expect(
				getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: "wrong.com/*",
					accountId: "some-account-id",
				})
			).rejects.toMatchInlineSnapshot(`
				[Error: Could not find zone for \`wrong.com\`. Make sure the domain is set up to be proxied by Cloudflare.
				For more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route]
			`);
		});
		test("zone_id route", async () => {
			// example-id and other-id intentionally different to show that the API is not called
			// when a zone_id is provided in the route
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: { pattern: "example.com/*", zone_id: "other-id" },
					accountId: "some-account-id",
				})
			).toEqual({
				host: "example.com",
				id: "other-id",
			});
		});
		test("zone_id route (custom hostname)", async () => {
			// example-id and other-id intentionally different to show that the API is not called
			// when a zone_id is provided in the route
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: {
						pattern: "some.third-party.com/*",
						zone_id: "other-id",
					},
					accountId: "some-account-id",
				})
			).toEqual({
				host: "some.third-party.com",
				id: "other-id",
			});
		});

		test("zone_name route (apex)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: {
						pattern: "example.com/*",
						zone_name: "example.com",
					},
					accountId: "some-account-id",
				})
			).toEqual({
				host: "example.com",
				id: "example-id",
			});
		});
		test("zone_name route (subdomain)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: {
						pattern: "subdomain.example.com/*",
						zone_name: "example.com",
					},
					accountId: "some-account-id",
				})
			).toEqual({
				host: "subdomain.example.com",
				id: "example-id",
			});
		});
		test("zone_name route (custom hostname)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute(COMPLIANCE_REGION_CONFIG_UNKNOWN, {
					route: {
						pattern: "some.third-party.com/*",
						zone_name: "example.com",
					},
					accountId: "some-account-id",
				})
			).toEqual({
				host: "some.third-party.com",
				id: "example-id",
			});
		});
		test("zone_name route (subdomain, subsequent fetches are cached)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			const zoneIdCache = new Map();
			expect(
				await getZoneForRoute(
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
					{
						route: {
							pattern: "subdomain.example.com/*",
							zone_name: "example.com",
						},
						accountId: "some-account-id",
					},
					zoneIdCache
				)
			).toEqual({
				host: "subdomain.example.com",
				id: "example-id",
			});

			expect(await zoneIdCache.get("some-account-id:example.com")).toEqual(
				"example-id"
			);

			// This will fail if we don't cache the response
			// due to a "mock not found" error
			expect(
				await getZoneForRoute(
					COMPLIANCE_REGION_CONFIG_UNKNOWN,
					{
						route: {
							pattern: "subdomain.example.com/*",
							zone_name: "example.com",
						},
						accountId: "some-account-id",
					},
					zoneIdCache
				)
			).toEqual({
				host: "subdomain.example.com",
				id: "example-id",
			});
		});
	});
});
