import { describe, expect, it } from "vitest";
import { redactCloudflaredArgsForLogging } from "../tunnel/cloudflared";

describe("cloudflared arg redaction", () => {
	it("redacts --token and other sensitive values", () => {
		const args = [
			"tunnel",
			"run",
			"--token",
			"SECRET_TOKEN",
			"--credentials-contents",
			"SECRET_CREDS",
			"--origincert",
			"/path/to/cert.pem",
		];

		expect(redactCloudflaredArgsForLogging(args)).toEqual([
			"tunnel",
			"run",
			"--token",
			"[REDACTED]",
			"--credentials-contents",
			"[REDACTED]",
			"--origincert",
			"[REDACTED]",
		]);
	});

	it("redacts --token=... style", () => {
		expect(redactCloudflaredArgsForLogging(["--token=SECRET"])).toEqual([
			"--token=[REDACTED]",
		]);
	});
});
