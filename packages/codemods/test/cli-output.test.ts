import { describe, it } from "vitest";
import { formatFollowUps } from "../src/cli-output";

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
