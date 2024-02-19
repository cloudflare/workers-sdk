import { rest } from "msw";
import { getHostFromUrl, getZoneForRoute } from "../zones";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { msw } from "./helpers/msw";

function mockGetZones(domain: string, zones: { id: string }[] = []) {
	msw.use(
		rest.get("*/zones", (req, res, ctx) => {
			expect([...req.url.searchParams.entries()]).toEqual([["name", domain]]);

			return res.once(
				ctx.status(200),
				ctx.json({
					success: true,
					errors: [],
					messages: [],
					result: zones,
				})
			);
		})
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
			expect(await getZoneForRoute("example.com/*")).toEqual({
				host: "example.com",
				id: "example-id",
			});
		});

		test("string route (not a zone)", async () => {
			mockGetZones("wrong.com", []);
			await expect(
				getZoneForRoute("wrong.com/*")
			).rejects.toMatchInlineSnapshot(
				`[Error: Could not find zone for wrong.com]`
			);
		});
		test("zone_id route", async () => {
			// example-id and other-id intentionally different to show that the API is not called
			// when a zone_id is provided in the route
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute({ pattern: "example.com/*", zone_id: "other-id" })
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
				await getZoneForRoute({
					pattern: "some.third-party.com/*",
					zone_id: "other-id",
				})
			).toEqual({
				host: "some.third-party.com",
				id: "other-id",
			});
		});

		test("zone_name route (apex)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute({
					pattern: "example.com/*",
					zone_name: "example.com",
				})
			).toEqual({
				host: "example.com",
				id: "example-id",
			});
		});
		test("zone_name route (subdomain)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute({
					pattern: "subdomain.example.com/*",
					zone_name: "example.com",
				})
			).toEqual({
				host: "subdomain.example.com",
				id: "example-id",
			});
		});
		test("zone_name route (custom hostname)", async () => {
			mockGetZones("example.com", [{ id: "example-id" }]);
			expect(
				await getZoneForRoute({
					pattern: "some.third-party.com/*",
					zone_name: "example.com",
				})
			).toEqual({
				host: "some.third-party.com",
				id: "example-id",
			});
		});
	});
});
