import { describe, it } from "vitest";
import { partitionRoutes } from "../src/shared/partition-routes";
import type { Route } from "@cloudflare/workers-utils";

describe("partitionRoutes", () => {
	it("partitions ordinary routes and custom domains", ({ expect }) => {
		const ordinaryRoutes: Route[] = [
			"example.com/*",
			{ pattern: "api.example.com/*", zone_name: "example.com" },
			{
				pattern: "disabled.example.com/*",
				zone_id: "zone-id",
				custom_domain: false,
			},
		];
		const customDomains: Route[] = [
			{ pattern: "app.example.com", custom_domain: true },
		];

		expect(partitionRoutes([...ordinaryRoutes, ...customDomains])).toEqual({
			routesOnly: ordinaryRoutes,
			customDomainsOnly: customDomains,
		});
	});
});
