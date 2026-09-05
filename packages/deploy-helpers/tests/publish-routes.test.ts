import { describe, it } from "vitest";
import { renderRoute } from "../src/triggers/publish-routes";
import type { Route } from "@cloudflare/workers-utils";

describe("renderRoute", () => {
	it.for([
		{ enabled: true, expected: "production: enabled" },
		{ enabled: false, expected: "production: disabled" },
	])(
		"renders an explicit production value",
		({ enabled, expected }, { expect }) => {
			expect(
				renderRoute({ pattern: "example.com", custom_domain: true, enabled })
			).toBe(`example.com (custom domain) [${expected}]`);
		}
	);

	it.for([
		{ previews_enabled: true, expected: "previews: enabled" },
		{ previews_enabled: false, expected: "previews: disabled" },
	])(
		"renders an explicit Preview value",
		({ previews_enabled, expected }, { expect }) => {
			expect(
				renderRoute({
					pattern: "example.com",
					custom_domain: true,
					previews_enabled,
				})
			).toBe(`example.com (custom domain) [${expected}]`);
		}
	);

	it("omits unspecified values", ({ expect }) => {
		expect(renderRoute({ pattern: "example.com", custom_domain: true })).toBe(
			"example.com (custom domain)"
		);
	});

	it("renders production and Preview values together", ({ expect }) => {
		expect(
			renderRoute({
				pattern: "example.com",
				custom_domain: true,
				enabled: false,
				previews_enabled: true,
			})
		).toBe(
			"example.com (custom domain) [production: disabled, previews: enabled]"
		);
	});

	it.for<{ route: Route; expected: string }>([
		{ route: "example.com/*", expected: "example.com/*" },
		{
			route: { pattern: "example.com/*", zone_id: "zone-id" },
			expected: "example.com/* (zone id: zone-id)",
		},
		{
			route: { pattern: "example.com/*", zone_name: "example.com" },
			expected: "example.com/* (zone name: example.com)",
		},
	])("preserves non-custom route output", ({ route, expected }, { expect }) => {
		expect(renderRoute(route)).toBe(expected);
	});
});
