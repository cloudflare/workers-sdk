import { it } from "vitest";
import { normalizeOutput } from "./normalize";

const telemetryBanner =
	"Cloudflare collects anonymous telemetry about your usage of Wrangler. Learn more at https://github.com/cloudflare/workers-sdk/tree/main/packages/wrangler/telemetry.md";

it.for(["\n", "\r\n"])(
	"ignores the stateful telemetry notice in snapshots with newline %j",
	(newline, { expect }) => {
		const output = [
			`\u001b[90m${telemetryBanner}\u001b[39m`,
			"Total Upload: 0.17 KiB / gzip: 0.15 KiB",
		].join(newline);

		expect(normalizeOutput(output)).toBe("Total Upload: xx KiB / gzip: xx KiB");
	}
);

it("preserves deployment errors alongside the telemetry notice", ({
	expect,
}) => {
	const output = [
		telemetryBanner,
		"✘ [ERROR] Upload failed",
		"binding D1 of type d1 failed to generate. [code: 10021]",
	].join("\n");

	expect(normalizeOutput(output)).toBe(
		"X [ERROR] Upload failed\nbinding D1 of type d1 failed to generate. [code: 10021]"
	);
});
