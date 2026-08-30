import { describe, test } from "vitest";
import {
	formatWranglerPreviewVersionWarning,
	isWranglerPreviewVersionUnsupported,
	warnIfWranglerPreviewVersionUnsupported,
} from "../preview/version-warning";
import { mockConsoleMethods } from "./helpers/mock-console";

describe("wrangler preview version warning", () => {
	const std = mockConsoleMethods();

	test("requires Wrangler 4.127.1 or later", ({ expect }) => {
		expect(isWranglerPreviewVersionUnsupported("4.127.0")).toBe(true);
		expect(isWranglerPreviewVersionUnsupported("4.127.1")).toBe(false);
		expect(isWranglerPreviewVersionUnsupported("4.128.0")).toBe(false);
	});

	test("points users at the project-local Wrangler install", ({ expect }) => {
		expect(formatWranglerPreviewVersionWarning("4.123.0"))
			.toMatchInlineSnapshot(`
			"Workers Previews require Wrangler 4.127.1 or later. This project is using Wrangler 4.123.0.

			\`npx wrangler preview\` uses the Wrangler installed in this project, not your global Wrangler.

			Update this project:
			  npm install -D wrangler@latest @cloudflare/workers-types@latest

			Or run once:
			  npx wrangler@latest preview"
		`);
	});

	test("warns when the Wrangler version is unsupported", ({ expect }) => {
		expect(warnIfWranglerPreviewVersionUnsupported("4.123.0")).toBe(true);
		expect(std.warn).toContain(
			"Workers Previews require Wrangler 4.127.1 or later."
		);
		expect(std.warn).toContain("npm install -D wrangler@latest");
	});

	test("does not warn when the Wrangler version is supported", ({ expect }) => {
		expect(warnIfWranglerPreviewVersionUnsupported("4.127.1")).toBe(false);
		expect(std.warn).toBe("");
	});
});
