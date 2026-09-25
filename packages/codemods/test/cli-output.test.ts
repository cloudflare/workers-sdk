import { describe, it } from "vitest";
import {
	formatFollowUps,
	getCodemodExitCode,
	getCodemodSummary,
} from "../src/cli-output";

describe("getCodemodExitCode", () => {
	it("fails when manual intervention is required", ({ expect }) => {
		expect(getCodemodExitCode("needs-intervention")).toBe(1);
	});

	it("succeeds for complete and unspecified statuses", ({ expect }) => {
		expect(getCodemodExitCode("complete")).toBe(0);
		expect(getCodemodExitCode("skipped")).toBe(0);
		expect(getCodemodExitCode(undefined)).toBe(0);
	});
});

describe("getCodemodSummary", () => {
	it("reports excluded inputs as skipped", ({ expect }) => {
		expect(
			getCodemodSummary(
				{
					changedFiles: [],
					message: "wrangler.json is excluded by --files.",
					status: "skipped",
				},
				false
			)
		).toBe("Skipped: wrangler.json is excluded by --files.");
	});

	it("omits install instructions when dependencies are ready", ({ expect }) => {
		expect(
			getCodemodSummary(
				{
					changedFiles: ["cloudflare.config.ts", "package.json"],
					requiresInstall: false,
				},
				false
			)
		).toBe("Updated 2 file(s).");
	});

	it("includes install instructions when dependencies require installation", ({
		expect,
	}) => {
		expect(
			getCodemodSummary(
				{
					changedFiles: ["cloudflare.config.ts"],
					requiresInstall: true,
				},
				false
			)
		).toBe(
			"Updated 1 file(s). Run your package manager's install command to refresh its lockfile."
		);
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
