import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gt } from "semver";
import { it } from "vitest";
import {
	correctVersionReferences,
	getNpmPrereleaseConfig,
	getNextMiniflarePrereleaseVersion,
	getNextMiniflareVersion,
	getNextNpmPrereleaseVersion,
} from "../changeset-version";

it.for([
	["2.0.0", "2.0.0-beta.v.2"],
	["npm:@cloudflare/vite-plugin@1.63.2", "npm:@cloudflare/vite-plugin@1.63.2"],
	["workspace:*", "workspace:*"],
	["workspace:^", "workspace:^"],
	["1.63.2", "1.63.2"],
	["^1.63.2", "^1.63.2"],
	["catalog:default", "catalog:default"],
] as const)(
	"rewrites %s as %s across dependency fields",
	([constraint, expected], { expect, onTestFinished }) => {
		const directory = mkdtempSync(join(tmpdir(), "changeset-version-"));
		onTestFinished(() => {
			// eslint-disable-next-line workers-sdk/no-direct-recursive-rm -- test cleanup
			rmSync(directory, { recursive: true, force: true });
		});
		const packagePath = join(directory, "package.json");
		const packageName = "@cloudflare/vite-plugin";
		const fields = [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies",
		];
		writeFileSync(
			packagePath,
			JSON.stringify(
				Object.fromEntries(
					fields.map((key) => [key, { [packageName]: constraint }])
				)
			)
		);

		correctVersionReferences({
			packageName,
			packagePath,
			versionAfterChangesets: "2.0.0",
			nextVersion: "2.0.0-beta.v.2",
			changedPaths: [packagePath],
		});

		expect(JSON.parse(readFileSync(packagePath, "utf8"))).toEqual(
			Object.fromEntries(
				fields.map((key) => [key, { [packageName]: expected }])
			)
		);
	}
);

it("rejects latest as an npm prerelease tag", ({ expect }) => {
	expect(() =>
		getNpmPrereleaseConfig({
			name: "package-a",
			version: "1.0.0",
			"workers-sdk": {
				npmPrerelease: { tag: "latest", numbered: true },
			},
		})
	).toThrow("Invalid package-a npmPrerelease tag");
});

// prettier-ignore
const miniflareVersionTestCases = [
	// workerd,      mf previous,    bump        mf after,       mf corrected
	["1.20231001.0", "3.20231001.0", /* patch */ "3.20231001.1", "3.20231001.1"],
	["1.20231001.0", "3.20231001.0", /* minor */ "3.20231002.0", "3.20231001.1"],
	["1.20231002.0", "3.20231001.0", /* minor */ "3.20231002.0", "3.20231002.0"],
	["1.20231001.0", "3.20231001.2", /* minor */ "3.20231002.0", "3.20231001.3"],
	["1.20231001.0", "3.20231001.0", /* major */ "4.0.0",        "4.20231001.0"],
	["1.20231008.0", "3.20231001.0", /* patch */ "3.20231001.1", "3.20231008.0"],
	["1.20231008.0", "3.20231001.0", /* minor */ "3.20231002.0", "3.20231008.0"],
	["1.20231008.0", "3.20231001.0", /* major */ "4.0.0",        "4.20231008.0"],
	["1.20260812.0", "5.20260812.1-beta", /* graduate */ "5.20260812.1", "5.20260812.1"],
	["1.20260813.0", "5.20260812.1-beta", /* graduate */ "5.20260812.1", "5.20260813.0"],
];

for (const [
	workerdVersion,
	previousMiniflareVersion,
	miniflareVersion,
	correctMiniflareVersion,
] of miniflareVersionTestCases) {
	it(`changeset version ${workerdVersion} ${previousMiniflareVersion} -> ${miniflareVersion} = ${correctMiniflareVersion}`, ({
		expect,
	}) => {
		const actual = getNextMiniflareVersion(
			workerdVersion,
			previousMiniflareVersion,
			miniflareVersion
		);
		expect(actual).toEqual(correctMiniflareVersion);
	});
}

// prettier-ignore
const prereleaseVersionTestCases = [
	// workerd,       previous,             bump        after changesets,    identifier, corrected
	["1.20260723.0", "4.20260722.0",     /* major */ "5.0.0",             "alpha",    "5.20260723.0-alpha"],
	["1.20260723.0", "5.20260723.0-alpha", /* patch */ "5.20260723.0",      "alpha",    "5.20260723.1-alpha"],
	["1.20260723.0", "5.20260723.1-alpha", /* minor */ "5.20260724.0",      "alpha",    "5.20260723.2-alpha"],
	["1.20260907.1", "5.20260907.0-alpha", /* patch */ "5.20260907.0",      "alpha",    "5.20260907.1-alpha"],
	["1.20260907.1", "5.20260907.1-alpha", /* minor */ "5.20260908.0",      "alpha",    "5.20260907.2-alpha"],
	["1.20260723.0", "5.20260723.2-alpha", /* major */ "6.0.0",             "alpha",    "5.20260723.3-alpha"],
	["1.20260723.0", "5.20260723.1-alpha", /* patch */ "5.20260723.1",      "beta",     "5.20260723.2-beta"],
	["1.20260724.0", "5.20260723.3-alpha", /* patch */ "5.20260723.3",      "alpha",    "5.20260724.0-alpha"],
	["1.20260723.0", "5.20260723.1-alpha", /* none  */ "5.20260723.1-alpha", "alpha",   "5.20260723.1-alpha"],
	["1.20260724.0", "5.20260723.1-alpha", /* none  */ "5.20260723.1-alpha", "alpha",   "5.20260724.0-alpha"],
	["1.20260723.0", "4.20260722.0",     /* none  */ "4.20260722.0",      "alpha",    "4.20260723.0"],
];

for (const [
	workerdVersion,
	previousVersion,
	versionAfterChangesets,
	prereleaseIdentifier,
	correctVersion,
] of prereleaseVersionTestCases) {
	it(`changeset prerelease ${workerdVersion} ${previousVersion} -> ${versionAfterChangesets} (${prereleaseIdentifier}) = ${correctVersion}`, ({
		expect,
	}) => {
		const actual = getNextMiniflarePrereleaseVersion({
			workerdVersion,
			previousVersion,
			versionAfterChangesets,
			config: { tag: prereleaseIdentifier, numbered: false },
		});
		expect(actual).toEqual(correctVersion);
	});
}

it("applies the major-bump requirement to Miniflare prereleases", ({
	expect,
}) => {
	expect(() =>
		getNextMiniflarePrereleaseVersion({
			workerdVersion: "1.20260723.0",
			previousVersion: "4.20260722.0",
			versionAfterChangesets: "4.20260722.1",
			config: { tag: "alpha", numbered: false },
		})
	).toThrow("Starting a prerelease requires a major bump");
});

it("requires a major bump to start an npm prerelease", ({ expect }) => {
	expect(() =>
		getNextNpmPrereleaseVersion({
			previousVersion: "1.0.0",
			versionAfterChangesets: "1.1.0",
			config: { tag: "beta", numbered: true },
		})
	).toThrow("Starting a prerelease requires a major bump");
});

it.for(
	// prettier-ignore
	[
		// previous,           after changesets,        identifier, corrected
		["1.63.1",             "2.0.0",                 "beta",     "2.0.0-beta.0"],
		["2.0.0-beta.0",      "2.0.0",                 "beta",     "2.0.0-beta.1"],
		["2.0.0-beta.3",      "2.0.0",                 "rc",       "2.0.0-rc.0"],
		["2.0.0-beta.3",      "2.0.0-beta.3",          "beta",     "2.0.0-beta.3"],
	] as const
)(
	"changeset numbered prerelease %s -> %s (%s) = %s",
	(
		[
			previousVersion,
			versionAfterChangesets,
			prereleaseIdentifier,
			correctVersion,
		],
		{ expect }
	) => {
		const actual = getNextNpmPrereleaseVersion({
			previousVersion,
			versionAfterChangesets,
			config: { tag: prereleaseIdentifier, numbered: true },
		});
		expect(actual).toEqual(correctVersion);
	}
);

it("versions Vite plugin v2 betas after its SHA prereleases", ({ expect }) => {
	const config = getNpmPrereleaseConfig({
		name: "@cloudflare/vite-plugin",
		version: "1.63.1",
		"workers-sdk": {
			npmPrerelease: { tag: "beta", numbered: true },
		},
	});
	assert(config !== undefined);

	const firstVersion = getNextNpmPrereleaseVersion({
		previousVersion: "1.63.1",
		versionAfterChangesets: "2.0.0",
		config,
	});
	expect(firstVersion).toBe("2.0.0-beta.v.0");
	expect(gt(firstVersion, "2.0.0-beta.sha-fffffffff")).toBe(true);
	expect(
		getNextNpmPrereleaseVersion({
			previousVersion: firstVersion,
			versionAfterChangesets: "2.0.0",
			config,
		})
	).toBe("2.0.0-beta.v.1");
});
