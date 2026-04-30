import { describe, test } from "vitest";
import {
	brandBox,
	createBox,
	errorBox,
	infoBox,
	successBox,
	warningBox,
	wrapPlain,
} from "../box";

// chalk.level = 0 in test setup means supportsColor() returns false,
// so createBox falls back to the no-color rule layout instead of full
// boxen output. Tests cover both paths for the public helpers.

describe("box / wrapPlain", () => {
	test("returns a single-element array for short input", ({ expect }) => {
		expect(wrapPlain("short", 80)).toEqual(["short"]);
	});

	test("breaks long input on word boundaries", ({ expect }) => {
		expect(
			wrapPlain("this is a longer sentence that should wrap", 20)
		).toEqual(["this is a longer", "sentence that should", "wrap"]);
	});

	test("preserves explicit newlines", ({ expect }) => {
		expect(wrapPlain("line one\nline two", 80)).toEqual([
			"line one",
			"line two",
		]);
	});
});

describe("box / createBox no-color fallback", () => {
	test("renders title and rule when colors disabled", ({ expect }) => {
		const out = createBox("Hello", "info");
		expect(out).toContain("--- Info ---");
		expect(out).toContain("Hello");
		// Trailing rule.
		expect(out).toMatch(/─{40}$/);
	});

	test("respects custom title override", ({ expect }) => {
		const out = createBox("body", "info", { title: "Custom" });
		expect(out).toContain("--- Custom ---");
	});
});

describe("box / errorBox", () => {
	test("includes the headline message", ({ expect }) => {
		const out = errorBox("Authentication failed");
		expect(out).toContain("Authentication failed");
	});

	test("includes the details body when provided", ({ expect }) => {
		const out = errorBox("Authentication failed", "Run wrangler login");
		expect(out).toContain("Authentication failed");
		expect(out).toContain("Run wrangler login");
	});

	test("uses the override title when provided", ({ expect }) => {
		const out = errorBox("Boom", undefined, { title: "APIError" });
		expect(out).toContain("APIError");
	});
});

describe("box / other styles", () => {
	test("warningBox renders the message", ({ expect }) => {
		expect(warningBox("Heads up")).toContain("Heads up");
	});

	test("successBox renders the message", ({ expect }) => {
		expect(successBox("Done")).toContain("Done");
	});

	test("infoBox renders the message", ({ expect }) => {
		expect(infoBox("FYI")).toContain("FYI");
	});

	test("brandBox renders the content", ({ expect }) => {
		expect(brandBox("Welcome to wrangler")).toContain("Welcome to wrangler");
	});
});
