import { describe, it } from "vitest";
import {
	drawBox,
	drawConnectedChildBox,
	stripAnsi,
	visibleLength,
	padToVisibleWidth,
} from "../../utils/box";

describe("stripAnsi", () => {
	it("strips ANSI escape codes", ({ expect }) => {
		expect(stripAnsi("\x1b[32mhello\x1b[0m")).toBe("hello");
	});

	it("returns plain strings unchanged", ({ expect }) => {
		expect(stripAnsi("hello")).toBe("hello");
	});

	it("handles multiple ANSI sequences", ({ expect }) => {
		expect(stripAnsi("\x1b[1m\x1b[31mbold red\x1b[0m")).toBe("bold red");
	});
});

describe("visibleLength", () => {
	it("returns length ignoring ANSI codes", ({ expect }) => {
		expect(visibleLength("\x1b[32mhello\x1b[0m")).toBe(5);
	});

	it("returns plain string length", ({ expect }) => {
		expect(visibleLength("hello")).toBe(5);
	});
});

describe("padToVisibleWidth", () => {
	it("pads visible content to target width", ({ expect }) => {
		const result = padToVisibleWidth("hi", 5);
		expect(result).toBe("hi   ");
		expect(result.length).toBe(5);
	});

	it("does not pad if already at width", ({ expect }) => {
		expect(padToVisibleWidth("hello", 5)).toBe("hello");
	});

	it("accounts for ANSI codes when padding", ({ expect }) => {
		const result = padToVisibleWidth("\x1b[32mhi\x1b[0m", 5);
		expect(result).toBe("\x1b[32mhi\x1b[0m   ");
	});

	it("handles content wider than target", ({ expect }) => {
		expect(padToVisibleWidth("hello", 3)).toBe("hello");
	});
});

describe("drawBox", () => {
	it("draws a box around content", ({ expect }) => {
		const result = drawBox(["hello", "world"]);
		expect(result).toBe(
			["╭───────╮", "│ hello │", "│ world │", "╰───────╯"].join("\n")
		);
	});

	it("handles single-line content", ({ expect }) => {
		const result = drawBox(["hello"]);
		expect(result).toBe(["╭───────╮", "│ hello │", "╰───────╯"].join("\n"));
	});

	it("handles empty content with footer lines", ({ expect }) => {
		const result = drawBox([], { footerLines: ["footer"] });
		expect(result).toBe(["╭────────╮", "│ footer │", "╰────────╯"].join("\n"));
	});

	it("handles empty content array without crashing", ({ expect }) => {
		const result = drawBox([]);
		expect(result).toBe(["╭──╮", "╰──╯"].join("\n"));
	});

	it("renders bottom connector when connectToChild is set", ({ expect }) => {
		const result = drawBox(["parent"], { connectToChild: true });
		expect(result).toBe(["╭────────╮", "│ parent │", "╰─┬──────╯"].join("\n"));
	});

	it("handles ANSI escape codes in content", ({ expect }) => {
		const result = drawBox(["\x1b[32mgreen\x1b[0m"]);
		expect(result).toBe(
			["╭───────╮", "│ \x1b[32mgreen\x1b[0m │", "╰───────╯"].join("\n")
		);
	});

	it("adjusts width to the longest line", ({ expect }) => {
		const result = drawBox(["short", "a longer line"]);
		expect(result).toBe(
			[
				"╭───────────────╮",
				"│ short         │",
				"│ a longer line │",
				"╰───────────────╯",
			].join("\n")
		);
	});
});

describe("drawConnectedChildBox", () => {
	it("draws a connected child box", ({ expect }) => {
		const result = drawConnectedChildBox(["child"]);
		expect(result).toBe(
			["  │", "  │ ╭───────╮", "  ╰─┤ child │", "    ╰───────╯"].join("\n")
		);
	});

	it("respects custom indent", ({ expect }) => {
		const result = drawConnectedChildBox(["child"], { indent: "    " });
		expect(result).toBe(
			["    │", "    │ ╭───────╮", "    ╰─┤ child │", "      ╰───────╯"].join(
				"\n"
			)
		);
	});

	it("places connector at specified line index", ({ expect }) => {
		const result = drawConnectedChildBox(["a", "b", "c"], {
			connectorLineIndex: 0,
		});
		expect(result).toBe(
			[
				"  │",
				"  │ ╭───╮",
				"  ╰─┤ a │",
				"    │ b │",
				"    │ c │",
				"    ╰───╯",
			].join("\n")
		);
	});

	it("draws correctly with multiple lines", ({ expect }) => {
		const result = drawConnectedChildBox(["a", "b", "c"]);
		expect(result).toBe(
			[
				"  │",
				"  │ ╭───╮",
				"  │ │ a │",
				"  ╰─┤ b │",
				"    │ c │",
				"    ╰───╯",
			].join("\n")
		);
	});
});
