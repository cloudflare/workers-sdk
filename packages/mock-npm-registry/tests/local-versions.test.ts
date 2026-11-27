import semver from "semver";
import { describe, test } from "vitest";
import { getLocalVersion, rewriteManifest } from "../src/local-versions";
import type { LocalVersion } from "../src/local-versions";

describe("getLocalVersion", () => {
	test("puts the real version in a 0.0.0 prerelease", ({ expect }) => {
		expect(getLocalVersion("0.32.1")).toBe("0.0.0-local.0.32.1");
		expect(getLocalVersion("5.20261113.0-beta")).toBe(
			"0.0.0-local.5.20261113.0-beta"
		);
		expect(getLocalVersion("2.0.0-beta.v.17")).toBe(
			"0.0.0-local.2.0.0-beta.v.17"
		);
	});

	test("doesn't satisfy ranges for the real version", ({ expect }) => {
		const cases = [
			["0.32.1", "^0.32.1"],
			["0.32.1", "^0.32.1-beta.0"],
			["0.32.1", ">=0.32.1-0"],
			["5.20261113.0-beta", "^5.20261113.0-beta"],
			["5.20261113.0-beta", ">=5.20261113.0-beta"],
			["5.20261113.0-beta", "~5.20261113.0-0"],
		] as const;
		for (const [version, range] of cases) {
			const localVersion = getLocalVersion(version);
			expect(semver.valid(localVersion), localVersion).toBe(localVersion);
			expect(semver.satisfies(version, range), `${version} ${range}`).toBe(
				true
			);
			expect(
				semver.satisfies(localVersion, range),
				`${localVersion} ${range}`
			).toBe(false);
		}
	});
});

describe("rewriteManifest", () => {
	const localVersions = new Map<string, LocalVersion>([
		["@cloudflare/config", { from: "0.32.1", to: "0.0.0-local.0.32.1" }],
		[
			"miniflare",
			{ from: "5.20261113.0-beta", to: "0.0.0-local.5.20261113.0-beta" },
		],
	]);

	test("renames the package itself", ({ expect }) => {
		const manifest = rewriteManifest(
			{ name: "@cloudflare/config", version: "0.32.1", type: "module" },
			localVersions
		);
		expect(manifest).toEqual({
			name: "@cloudflare/config",
			version: "0.0.0-local.0.32.1",
			type: "module",
		});
	});

	test("points dependencies on local packages at their local versions", ({
		expect,
	}) => {
		const manifest = rewriteManifest(
			{
				name: "@cloudflare/vite-plugin",
				version: "2.0.0-beta.v.17",
				dependencies: {
					"@cloudflare/config": "0.32.1",
					miniflare: "5.20261113.0-beta",
					ws: "8.21.0",
				},
				optionalDependencies: { miniflare: "5.20261113.0-beta" },
				peerDependencies: { "@cloudflare/config": "0.32.1", vite: "^8.0.0" },
				devDependencies: { "@cloudflare/config": "0.32.1" },
			},
			localVersions
		);
		expect(manifest).toEqual({
			name: "@cloudflare/vite-plugin",
			// Packages that aren't renamed keep their real version.
			version: "2.0.0-beta.v.17",
			dependencies: {
				"@cloudflare/config": "0.0.0-local.0.32.1",
				miniflare: "0.0.0-local.5.20261113.0-beta",
				ws: "8.21.0",
			},
			optionalDependencies: { miniflare: "0.0.0-local.5.20261113.0-beta" },
			peerDependencies: {
				"@cloudflare/config": "0.0.0-local.0.32.1",
				vite: "^8.0.0",
			},
			// devDependencies aren't installed by consumers.
			devDependencies: { "@cloudflare/config": "0.32.1" },
		});
	});

	test("doesn't modify the input", ({ expect }) => {
		const input = {
			name: "wrangler",
			version: "4.162.0",
			dependencies: { miniflare: "5.20261113.0-beta" },
		};
		rewriteManifest(input, localVersions);
		expect(input).toEqual({
			name: "wrangler",
			version: "4.162.0",
			dependencies: { miniflare: "5.20261113.0-beta" },
		});
	});

	test("rejects a dependency on a local package that isn't its exact version", ({
		expect,
	}) => {
		expect(() =>
			rewriteManifest(
				{
					name: "wrangler",
					version: "4.162.0",
					dependencies: { "@cloudflare/config": "^0.32.1" },
				},
				localVersions
			)
		).toThrow(
			'wrangler has dependencies "@cloudflare/config": "^0.32.1", but the local copy of @cloudflare/config can only replace the exact version 0.32.1.'
		);
	});

	test("rejects a package whose packed version is unexpected", ({ expect }) => {
		expect(() =>
			rewriteManifest(
				{ name: "@cloudflare/config", version: "0.33.0" },
				localVersions
			)
		).toThrow("Expected @cloudflare/config to be version 0.32.1, found 0.33.0");
	});
});
