import { getZoneForRoute } from "@cloudflare/deploy-helpers";
import { COMPLIANCE_REGION_CONFIG_UNKNOWN } from "@cloudflare/workers-utils";
import { http, HttpResponse } from "msw";
/* eslint-disable-next-line no-restricted-imports --
 * Uses expect in MSW handlers outside test callbacks
 * TODO: remove this `expect` import
 */
import { describe, expect, it, test } from "vitest";
import { getHostFromUrl, getZoneFromRoute } from "../zones";
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
		// Tests for the new `getZoneFromRoute` helper used to derive the
		// `CF-Worker` outbound header value in local development. Per the docs
		// (https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-worker)
		// the production header is the *zone name* that owns the Worker — not
		// the route pattern's hostname. We honour that when the user has told
		// us the zone name in their config; otherwise we approximate it with
		// the pattern hostname, since we can't perform an API lookup here.
		describe("getZoneFromRoute", () => {
			it("returns the URL host for a SimpleRoute (string)", ({ expect }) => {
				expect(getZoneFromRoute("https://example.com/api/*")).toBe(
					"example.com"
				);
				expect(getZoneFromRoute("foo.example.com/*")).toBe("foo.example.com");
			});

			it("returns `zone_name` for a ZoneNameRoute (subdomain pattern)", ({
				expect,
			}) => {
				expect(
					getZoneFromRoute({
						pattern: "foo.example.com/*",
						zone_name: "example.com",
					})
				).toBe("example.com");
			});

			it("returns `zone_name` for a ZoneNameRoute (apex pattern)", ({
				expect,
			}) => {
				expect(
					getZoneFromRoute({
						pattern: "example.com/*",
						zone_name: "example.com",
					})
				).toBe("example.com");
			});

			it("returns `zone_name` for a ZoneNameRoute with the unparseable `*/*` pattern", ({
				expect,
			}) => {
				expect(
					getZoneFromRoute({
						pattern: "*/*",
						zone_name: "example.com",
					})
				).toBe("example.com");
			});

			it("returns `undefined` when the pattern is unparseable and no `zone_name` is available", ({
				expect,
			}) => {
				// With neither a parseable hostname nor a `zone_name` to fall
				// back on we can't approximate the zone at all — let Miniflare
				// apply its default of `<worker-name>.example.com`.
				expect(getZoneFromRoute("*/*")).toBeUndefined();
				expect(
					getZoneFromRoute({ pattern: "*/*", zone_id: "abc123" })
				).toBeUndefined();
			});

			it("falls back to the pattern hostname for a ZoneIdRoute", ({
				expect,
			}) => {
				// Without an API lookup we can't resolve a zone_id to its name;
				// the pattern hostname is the best local approximation.
				expect(
					getZoneFromRoute({
						pattern: "foo.example.com/*",
						zone_id: "abc123",
					})
				).toBe("foo.example.com");
			});

			it("falls back to the pattern hostname for a CustomDomainRoute", ({
				expect,
			}) => {
				expect(
					getZoneFromRoute({
						pattern: "custom.example.com",
						custom_domain: true,
					})
				).toBe("custom.example.com");
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
