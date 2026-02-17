import { describe, it } from "vitest";
import { redactCloudflaredArgsForLogging } from "../tunnel/cloudflared";

describe("cloudflared arg redaction", () => {
	it("redacts --token and other sensitive values", ({ expect }) => {
		const args = ["tunnel", "run", "--token", "SECRET_TOKEN"];

		expect(redactCloudflaredArgsForLogging(args)).toEqual([
			"tunnel",
			"run",
			"--token",
			"[REDACTED]",
		]);
	});

	it("redacts --token=... style", ({ expect }) => {
		expect(redactCloudflaredArgsForLogging(["--token=SECRET"])).toEqual([
			"--token=[REDACTED]",
		]);
	});
});
