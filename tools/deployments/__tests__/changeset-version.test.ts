import { it } from "vitest";
import {
	getNextMiniflarePrereleaseVersion,
	getNextMiniflareVersion,
} from "../../../.github/changeset-version";

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
	// workerd,       previous,             bump        changesets,          identifier, corrected
	["1.20260723.0", "4.20260722.0",     /* major */ "5.0.0",             "alpha",    "5.20260723.0-alpha"],
	["1.20260723.0", "5.20260723.0-alpha", /* patch */ "5.20260723.0",      "alpha",    "5.20260723.1-alpha"],
	["1.20260723.0", "5.20260723.1-alpha", /* minor */ "5.20260724.0",      "alpha",    "5.20260723.2-alpha"],
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
	changesetsVersion,
	prereleaseIdentifier,
	correctVersion,
] of prereleaseVersionTestCases) {
	it(`changeset prerelease ${workerdVersion} ${previousVersion} -> ${changesetsVersion} (${prereleaseIdentifier}) = ${correctVersion}`, ({
		expect,
	}) => {
		const actual = getNextMiniflarePrereleaseVersion(
			workerdVersion,
			previousVersion,
			changesetsVersion,
			prereleaseIdentifier
		);
		expect(actual).toEqual(correctVersion);
	});
}

it("requires a major bump to start a prerelease", ({ expect }) => {
	expect(() =>
		getNextMiniflarePrereleaseVersion(
			"1.20260723.0",
			"4.20260722.0",
			"4.20260722.1",
			"alpha"
		)
	).toThrow("Starting a prerelease requires a major bump");
});
