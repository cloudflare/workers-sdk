import { describe, it } from "vitest";
import { formatFollowUps, getCodemodExitCode } from "../src/cli-output";

describe("getCodemodExitCode", () => {
	it("fails when manual intervention is required", ({ expect }) => {
		expect(getCodemodExitCode("needs-intervention")).toBe(1);
	});

	it("succeeds for complete and unspecified statuses", ({ expect }) => {
		expect(getCodemodExitCode("complete")).toBe(0);
		expect(getCodemodExitCode(undefined)).toBe(0);
	});
});

describe("formatFollowUps", () => {
	it("formats blocking and informational follow-ups", ({ expect }) => {
		expect(
			formatFollowUps([
				{
					blocking: true,
					docsUrl: "https://developers.cloudflare.com/example/",
					message: "Review this migration.",
					sourcePath: "env.production",
				},
				{
					blocking: false,
					message: "Environments were migrated.",
				},
			])
		).toEqual([
			"Follow-up work:",
			"  - [required] env.production: Review this migration.",
			"    https://developers.cloudflare.com/example/",
			"  - [info] Environments were migrated.",
		]);
	});

	it("returns no output without follow-ups", ({ expect }) => {
		expect(formatFollowUps([])).toEqual([]);
	});
});
