import { describe, it } from "vitest";
import { renderRoute } from "../src/triggers/publish-routes";
import type { Route } from "@cloudflare/workers-utils";

const customDomain = { pattern: "example.com", custom_domain: true } as const;

describe("renderRoute", () => {
	it.for<{ route: Route; expected: string }>([
		{
			route: { ...customDomain, enabled: true },
			expected: "example.com (custom domain) [production: enabled]",
		},
		{
			route: { ...customDomain, enabled: false },
			expected: "example.com (custom domain) [production: disabled]",
		},
		{
			route: { ...customDomain, previews_enabled: true },
			expected: "example.com (custom domain) [previews: enabled]",
		},
		{
			route: { ...customDomain, previews_enabled: false },
			expected: "example.com (custom domain) [previews: disabled]",
		},
		{
			route: customDomain,
			expected: "example.com (custom domain)",
		},
		{
			route: { ...customDomain, enabled: false, previews_enabled: true },
			expected:
				"example.com (custom domain) [production: disabled, previews: enabled]",
		},
		{ route: "example.com/*", expected: "example.com/*" },
		{
			route: { pattern: "example.com/*", zone_id: "zone-id" },
			expected: "example.com/* (zone id: zone-id)",
		},
		{
			route: { pattern: "example.com/*", zone_name: "example.com" },
			expected: "example.com/* (zone name: example.com)",
		},
	])("renders $expected", ({ route, expected }, { expect }) => {
		expect(renderRoute(route)).toBe(expected);
	});
});
