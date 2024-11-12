import { expect, it } from "vitest";
// @ts-expect-error This is a JS file
import { getNextMiniflareVersion } from "../../../.github/changeset-version";

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

it.each(miniflareVersionTestCases)(
	"changeset version",
	(
		workerdVersion,
		previousMiniflareVersion,
		miniflareVersion,
		correctMiniflareVersion
	) => {
		const actual = getNextMiniflareVersion(
			workerdVersion,
			previousMiniflareVersion,
			miniflareVersion
		);
		expect(actual).toEqual(correctMiniflareVersion);
	}
);
