import { describe, it } from "vitest";
import { formatMessage } from "../../utils/format-message";
import type { Message } from "@cloudflare/workers-utils";

describe("formatMessage", () => {
	const format = (input: Message) => {
		// No color and skip emojis at the start.
		return formatMessage(input, false).substring(2);
	};

	it("should format message without location", ({ expect }) => {
		expect(
			format({
				text: "Invalid argument",
				kind: "warning",
			})
		).toMatchInlineSnapshot(`
      "[WARNING] Invalid argument

      "
    `);
	});

	it("should format message with location", ({ expect }) => {
		expect(
			format({
				text: "Missing property: main",
				location: {
					line: 1,
					column: 0,
					lineText: "{}",
					file: "package.json",
					fileText: "{}",
				},
			})
		).toMatchInlineSnapshot(`
      "[ERROR] Missing property: main

          package.json:1:0:
            1 │ {}
              ╵ ^

      "
    `);
	});

	it("should format message with location and notes", ({ expect }) => {
		expect(
			format({
				text: "Invalid property: type",
				location: {
					line: 3,
					column: 8,
					length: 7,
					lineText: "type = 'modular'",
					suggestion: "Did you mean 'module'?",
					file: "package.toml",
					fileText: "[package]\ntype = 'modular'\n",
				},
				notes: [
					{
						text: "There are two acceptable types: 'module' and 'commonjs'",
					},
				],
			})
		).toMatchInlineSnapshot(`
      "[ERROR] Invalid property: type

          package.toml:3:8:
            3 │ type = 'modular'
              │         ~~~~~~~
              ╵         Did you mean 'module'?

        There are two acceptable types: 'module' and 'commonjs'

      "
    `);
	});
});
