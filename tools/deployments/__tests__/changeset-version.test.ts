import { it } from "vitest";
import {
	getNextMiniflareVersion,
	getNextPrereleaseVersion,
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
	// previous,      changesets,     configured,    corrected
	["4.20260722.0",  "4.20260723.0", "5.0.0-alpha", "5.0.0-alpha.0"],
	["4.20260722.0",  "5.0.0",        "5.0.0-alpha", "5.0.0-alpha.0"],
	["5.0.0-alpha.0", "5.0.0",        "5.0.0-alpha", "5.0.0-alpha.1"],
	["5.0.0-alpha.1", "5.0.0",        "5.0.0-beta",  "5.0.0-beta.0"],
	["5.0.0-alpha.4", "5.0.1",        "5.0.0-alpha", "5.0.0-alpha.5"],
	["5.0.0-alpha.4", "5.1.0",        "5.0.0-alpha", "5.0.0-alpha.5"],
	["5.0.0-alpha.4", "6.0.0",        "5.0.0-alpha", "5.0.0-alpha.5"],
	["5.0.0-alpha.4", "5.0.0-alpha.4", "5.0.0-alpha", "5.0.0-alpha.4"],
];

for (const [
	previousVersion,
	changesetsVersion,
	prereleaseVersion,
	correctVersion,
] of prereleaseVersionTestCases) {
	it(`changeset prerelease ${previousVersion} -> ${changesetsVersion} (${prereleaseVersion}) = ${correctVersion}`, ({
		expect,
	}) => {
		const actual = getNextPrereleaseVersion(
			previousVersion,
			changesetsVersion,
			prereleaseVersion
		);
		expect(actual).toEqual(correctVersion);
	});
}
