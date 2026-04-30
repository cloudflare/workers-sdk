import { describe, test } from "vitest";
import {
	command,
	error,
	hint,
	info,
	labelValue,
	listItem,
	sectionHeader,
	success,
	warning,
} from "../format";

// Tests run with chalk.level = 0 (see vite.setup.ts), so the assertions
// below ignore ANSI color codes — only the structure (symbol prefix +
// message) needs to be stable.

describe("format", () => {
	test("success prefixes the tick symbol", ({ expect }) => {
		expect(success("Done")).toMatchInlineSnapshot(`"◇  Done"`);
	});

	test("error prefixes the cross symbol", ({ expect }) => {
		expect(error("Failed")).toMatchInlineSnapshot('"✘ Failed"');
	});

	test("warning prefixes the warning symbol", ({ expect }) => {
		expect(warning("Heads up")).toMatchInlineSnapshot('"⚠ Heads up"');
	});

	test("info prefixes the info symbol", ({ expect }) => {
		expect(info("FYI")).toMatchInlineSnapshot('"ℹ FYI"');
	});

	test("hint prefixes the right-arrow", ({ expect }) => {
		expect(hint("Try this")).toMatchInlineSnapshot('"→ Try this"');
	});

	test("listItem indents 2 spaces and bullets", ({ expect }) => {
		expect(listItem("First")).toMatchInlineSnapshot('"  ● First"');
	});

	test("listItem accepts a custom indent", ({ expect }) => {
		expect(listItem("Nested", 4)).toMatchInlineSnapshot('"    ● Nested"');
	});

	test("sectionHeader renders a left bar + bold title", ({ expect }) => {
		expect(sectionHeader("Step 1 of 3")).toMatchInlineSnapshot(
			'"▎ Step 1 of 3"'
		);
	});

	test("sectionHeader joins title and subtitle with a middot", ({
		expect,
	}) => {
		expect(sectionHeader("Step 1 of 3", "Create an application")).toMatchInlineSnapshot(
			'"▎ Step 1 of 3 · Create an application"'
		);
	});

	test("labelValue separates with colon-space", ({ expect }) => {
		expect(labelValue("Zone ID", "abc123")).toMatchInlineSnapshot(
			'"Zone ID: abc123"'
		);
	});

	test("command is pass-through under chalk.level=0", ({ expect }) => {
		expect(command("wrangler login")).toBe("wrangler login");
	});
});
