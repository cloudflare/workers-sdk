import { describe, it } from "vitest";
import { getRemoteConfigDiff } from "../src/deploy/helpers/config-diffs";
import type { Config, Route } from "@cloudflare/workers-utils";

function compareRoutes(remoteRoutes: Route[], localRoutes: Route[]) {
	return getRemoteConfigDiff({ routes: remoteRoutes }, {
		routes: localRoutes,
	} as Config);
}

const customDomain = { pattern: "app.example.com", custom_domain: true };
const remoteCustomDomain = {
	...customDomain,
	zone_name: "example.com",
	enabled: true,
	previews_enabled: false,
};

describe("custom-domain remote config diffs", () => {
	it("ignores inferred zone metadata and effective defaults", ({ expect }) => {
		expect(compareRoutes([remoteCustomDomain], [customDomain])).toEqual({
			diff: null,
			nonDestructive: true,
		});
	});

	it("ignores inferred metadata for an apex domain", ({ expect }) => {
		const local = { pattern: "example.com", custom_domain: true };
		expect(
			compareRoutes([{ ...local, zone_name: "example.com" }], [local]).diff
		).toBeNull();
	});

	it("compares defaults when they are omitted remotely", ({ expect }) => {
		expect(
			compareRoutes(
				[customDomain],
				[{ ...customDomain, enabled: true, previews_enabled: false }]
			).diff
		).toBeNull();
	});

	it.for([
		{ zone_name: "example.org" },
		{ zone_id: "explicit-zone-id" },
		{ enabled: false },
		{ previews_enabled: true },
	])("preserves explicit local changes: %j", (change, { expect }) => {
		const result = compareRoutes(
			[remoteCustomDomain],
			[{ ...customDomain, ...change }]
		);
		expect(result.diff).not.toBeNull();
		expect(result.nonDestructive).toBe(false);
	});

	it.for([{ enabled: false }, { previews_enabled: true }])(
		"preserves explicit remote flag changes: %j",
		(change, { expect }) => {
			expect(
				compareRoutes([{ ...remoteCustomDomain, ...change }], [customDomain])
					.diff
			).not.toBeNull();
		}
	);

	it("compares matching explicit zones without a diff", ({ expect }) => {
		expect(
			compareRoutes(
				[remoteCustomDomain],
				[{ ...customDomain, zone_name: "example.com" }]
			).diff
		).toBeNull();
	});

	it("keeps a remote zone that is not a parent of the domain", ({ expect }) => {
		expect(
			compareRoutes(
				[{ ...remoteCustomDomain, zone_name: "ample.com" }],
				[customDomain]
			).diff
		).not.toBeNull();
	});

	it("does not hide changes to explicit zone IDs", ({ expect }) => {
		expect(
			compareRoutes(
				[{ ...remoteCustomDomain, zone_id: "remote-zone-id" }],
				[{ ...customDomain, zone_id: "local-zone-id" }]
			).diff
		).not.toBeNull();
	});

	it("does not normalize ordinary Worker routes", ({ expect }) => {
		const route = { pattern: "app.example.com/*", zone_name: "example.com" };
		expect(
			compareRoutes(
				[route],
				[{ pattern: route.pattern, zone_name: "example.org" }]
			).diff
		).not.toBeNull();
		expect(compareRoutes([route], [route]).diff).toBeNull();
	});

	it("keeps string routes unchanged", ({ expect }) => {
		expect(compareRoutes(["example.com/*"], ["example.com/*"]).diff).toBeNull();
	});

	it("keeps unmatched custom domains in the diff", ({ expect }) => {
		const result = compareRoutes([remoteCustomDomain], []);
		expect(result.diff).not.toBeNull();
		expect(result.nonDestructive).toBe(false);
	});

	it("does not mutate the supplied routes", ({ expect }) => {
		const remote = { ...remoteCustomDomain };
		const local = { ...customDomain };
		compareRoutes([remote], [local]);
		expect(remote).toEqual(remoteCustomDomain);
		expect(local).toEqual(customDomain);
	});

	it("compares empty route lists without a diff", ({ expect }) => {
		expect(compareRoutes([], []).diff).toBeNull();
	});

	it("preserves absent routes", ({ expect }) => {
		expect(getRemoteConfigDiff({}, {} as Config).diff).toBeNull();
	});
});
