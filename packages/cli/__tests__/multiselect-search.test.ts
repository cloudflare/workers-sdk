import { describe, expect, test } from "vitest";

import { stripAnsi } from "..";
import { getRenderers } from "../interactive";
import MultiSelectSearchPrompt from "../multiselect-search";

type PromptInternals = {
	onKeypress: (char?: string, key?: { name?: string }) => void;
	render: () => void;
	close: () => void;
};

function createPrompt(options: ConstructorParameters<typeof MultiSelectSearchPrompt>[0]["options"]) {
	const prompt = new MultiSelectSearchPrompt({
		options,
		render() {
			return "";
		},
	});

	const internals = prompt as unknown as PromptInternals;
	internals.render = () => {};
	internals.close = () => {};

	return { prompt, internals };
}

describe("MultiSelectSearchPrompt", () => {
	test.each(["h", "j", "k", "l"])(
		"allows vim key character %s to be typed into search",
		(char) => {
			const { prompt, internals } = createPrompt([
				{ label: "hijkl", value: "first" },
				{ label: "shufflejklh", value: "second" },
			]);

			prompt.cursor = 1;
			internals.onKeypress(char, { name: char });

			expect(prompt.search).toBe(char);
			expect(prompt.cursor).toBe(0);
			expect(prompt.filteredOptions.map((option) => option.value)).toEqual([
				"first",
				"second",
			]);
		}
	);

	test("keeps arrow key navigation working", () => {
		const { prompt, internals } = createPrompt([
			{ label: "first", value: "first" },
			{ label: "second", value: "second" },
		]);

		internals.onKeypress(undefined, { name: "down" });

		expect(prompt.cursor).toBe(1);
		expect(prompt.search).toBe("");
	});

	test("supports escape to cancel", () => {
		const { prompt, internals } = createPrompt([
			{ label: "first", value: "first" },
		]);

		internals.onKeypress(undefined, { name: "escape" });

		expect(prompt.state).toBe("cancel");
	});

	test("preserves submit handling in the custom keypress override", () => {
		const { prompt, internals } = createPrompt([
			{ label: "first", value: "first" },
		]);

		internals.onKeypress(undefined, { name: "return" });

		expect(prompt.state).toBe("submit");
	});

	test("preserves validation errors in the custom keypress override", () => {
		const prompt = new MultiSelectSearchPrompt({
			options: [{ label: "first", value: "first" }],
			render() {
				return "";
			},
			validate() {
				return "Pick something";
			},
		});

		const internals = prompt as unknown as PromptInternals;
		internals.render = () => {};
		internals.close = () => {};

		internals.onKeypress(undefined, { name: "return" });

		expect(prompt.state).toBe("error");
		expect(prompt.error).toBe("Pick something");
	});

	test("does not move cursor out of bounds when no options match", () => {
		const { prompt } = createPrompt([{ label: "apple", value: "apple" }]);

		prompt.emit("key", "z");

		expect(prompt.filteredOptions).toEqual([]);
		prompt.emit("cursor", "up");
		expect(prompt.cursor).toBe(0);
		prompt.emit("cursor", "down");
		expect(prompt.cursor).toBe(0);
	});

	test("restores cursor to the toggled option after clearing search", () => {
		const { prompt } = createPrompt([
			{ label: "apple", value: "apple" },
			{ label: "banana", value: "banana" },
			{ label: "carrot", value: "carrot" },
		]);

		prompt.emit("key", "b");
		prompt.emit("key", "a");
		prompt.emit("key", "n");
		prompt.emit("cursor", "space");

		expect(prompt.search).toBe("");
		expect(prompt.filteredOptions.map((option) => option.value)).toEqual([
			"apple",
			"banana",
			"carrot",
		]);
		expect(prompt.cursor).toBe(1);
		expect(prompt.selectedValues).toEqual(["banana"]);
	});

	test("ranks exact and prefix matches ahead of weaker matches", () => {
		const { prompt } = createPrompt([
			{ label: "Later substring", value: "later", sublabel: "contains abc later" },
			{ label: "Prefix match", value: "prefix-1", sublabel: "abc release" },
			{ label: "Metadata only", value: "metadata-1", sublabel: "release abc" },
			{ label: "Other", value: "abc" },
		]);

		prompt.emit("key", "a");
		prompt.emit("key", "b");
		prompt.emit("key", "c");

			expect(prompt.filteredOptions.map((option) => option.value)).toEqual([
			"abc",
			"prefix-1",
			"later",
			"metadata-1",
		]);
	});

	test("resets focus to the top ranked match when search results reorder", () => {
		const { prompt } = createPrompt([
			{ label: "Later substring", value: "later", sublabel: "contains abc later" },
			{ label: "Prefix match", value: "prefix-1", sublabel: "abc release" },
			{ label: "Metadata only", value: "metadata-1", sublabel: "release abc" },
			{ label: "Other", value: "abc" },
		]);

		prompt.cursor = 3;
		prompt.windowStart = 2;
		prompt.emit("key", "a");
		prompt.emit("key", "b");
		prompt.emit("key", "c");

		expect(prompt.cursor).toBe(0);
		expect(prompt.windowStart).toBe(0);
		prompt.emit("cursor", "space");
		expect(prompt.selectedValues).toEqual(["abc"]);
	});

	test("ranks clean metadata search text ahead of formatted sublabel content", () => {
		const { prompt } = createPrompt([
			{
				label: "Version one",
				value: "id-1",
				sublabel: "\u001B[90mTag: release-candidate\u001B[39m",
				searchText: ["release-candidate"],
			},
			{
				label: "Version two",
				value: "id-2",
				sublabel: "\u001B[90mMessage: release-candidate follows later\u001B[39m",
				searchText: ["release-candidate follows later"],
			},
		]);

		for (const char of "release-candidate") {
			prompt.emit("key", char);
		}

		expect(prompt.filteredOptions.map((option) => option.value)).toEqual([
			"id-1",
			"id-2",
		]);
	});

	test("does not clear search when space is pressed with no matches", () => {
		const { prompt } = createPrompt([{ label: "apple", value: "apple" }]);

		prompt.emit("key", "z");
		prompt.emit("cursor", "space");

		expect(prompt.search).toBe("z");
		expect(prompt.filteredOptions).toEqual([]);
		expect(prompt.selectedValues).toEqual([]);
	});

	test("renders match counts and a clearer empty state", () => {
		const renderers = getRenderers({
			type: "multiselect-search",
			question: "Pick versions",
			label: "",
			helpText: "",
			options: [{ label: "Alpha", value: "alpha" }],
			maxItemsPerPage: 5,
		});

		const lines = renderers.active(
			{ cursor: 0, value: ["alpha"] } as never,
			{ search: "zzz", filteredOptions: [], windowStart: 0 } as never
		);

		const rendered = stripAnsi(lines.join("\n"));
		expect(rendered).toContain("Search: zzz");
		expect(rendered).toContain("0 matches • 1 selected");
		expect(rendered).toContain("No matching options. Backspace to edit search.");
	});
});
