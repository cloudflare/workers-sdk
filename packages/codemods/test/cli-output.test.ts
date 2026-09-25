import { describe, it } from "vitest";
import {
	formatCompletionMessage,
	formatFollowUps,
	getCodemodExitCode,
} from "../src/cli-output";

describe("formatCompletionMessage", () => {
	it("omits install guidance when dependencies are already handled", ({
		expect,
	}) => {
		expect(formatCompletionMessage(1, false, false)).toBe("Updated 1 file(s).");
	});

	it("retains install guidance for other codemods", ({ expect }) => {
		expect(formatCompletionMessage(1, false, true)).toBe(
			"Updated 1 file(s). Run your package manager's install command to refresh its lockfile."
		);
	});

	it("formats dry runs and unchanged projects", ({ expect }) => {
		expect(formatCompletionMessage(1, true, true)).toBe(
			"Would update 1 file(s)."
		);
		expect(formatCompletionMessage(0, false, true)).toBe(
			"Project is already up to date."
		);
	});
});

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
