import { dedent } from "../setup";

describe("dedent", () => {
	test("empty string", () => {
		expect(dedent``).toBe("");
	});
	test("tab-indented block", () => {
		expect(dedent`
\t\t\tindented block
\t\t\t\twith content
\t\t\tover multiple lines
\t\t`).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("space-indented block", () => {
		expect(dedent`
      indented block
        with content
      over multiple lines
    `).toBe("indented block\n  with content\nover multiple lines");
	});
	test("mixed-indented block", () => {
		expect(dedent`
\t  indented block
\t  \twith content
\t  over multiple lines
\t  `).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("no indents on first line", () => {
		expect(dedent`indented block
\t\twith content
\tover multiple lines
\t`).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("no trailing newline", () => {
		expect(dedent`
\tindented block
\t\twith content
\tover multiple lines`).toBe(
			"indented block\n\twith content\nover multiple lines"
		);
	});
});
