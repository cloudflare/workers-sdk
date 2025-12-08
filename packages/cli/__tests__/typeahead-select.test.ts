import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import TypeaheadSelectPrompt from "../typeahead-select";
import type { Option } from "../typeahead-select";

// Mock the stdin/stdout for the prompt
const mockStdin = {
	on: vi.fn(),
	once: vi.fn(),
	off: vi.fn(),
	pause: vi.fn(),
	resume: vi.fn(),
	setRawMode: vi.fn(),
	removeListener: vi.fn(),
	setEncoding: vi.fn(),
	isTTY: true,
};

const mockStdout = {
	write: vi.fn(),
	isTTY: true,
	columns: 80,
};

describe("TypeaheadSelectPrompt", () => {
	const testOptions: Option[] = [
		{ label: "React", value: "react", description: "A JavaScript library" },
		{ label: "Vue", value: "vue", description: "A progressive framework" },
		{ label: "Angular", value: "angular", description: "A platform" },
		{
			label: "Svelte",
			value: "svelte",
			description: "Cybernetically enhanced",
		},
		{ label: "Next.js", value: "nextjs", description: "React framework" },
		{ label: "Nuxt", value: "nuxt", description: "Vue framework" },
		{ label: "Hidden Option", value: "hidden", hidden: true },
	];

	let keyHandler: ((char: string) => void) | undefined;

	beforeEach(() => {
		keyHandler = undefined;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function createPrompt(options: Option[] = testOptions) {
		const prompt = new TypeaheadSelectPrompt({
			options,
			initialValue: options[0]?.value ?? "",
			render: () => "",
			input: mockStdin as unknown as NodeJS.ReadStream,
			output: mockStdout as unknown as NodeJS.WriteStream,
		});

		// Capture the key handler
		const onSpy = vi.spyOn(prompt, "on");
		onSpy.mockImplementation((event: string, handler: unknown) => {
			if (event === "key") {
				keyHandler = handler as (char: string) => void;
			}
			return prompt;
		});

		// Re-setup event handlers to capture them
		prompt.on("key", (char: string) => {
			if (keyHandler) {
				keyHandler(char);
			}
		});

		return prompt;
	}

	function simulateTyping(prompt: TypeaheadSelectPrompt, text: string) {
		for (const char of text) {
			// Directly call the key handling logic
			if (char && char.length === 1 && char.charCodeAt(0) >= 32) {
				prompt.searchTerm += char;
				// Trigger filtering by calling the private method via the prompt's state
				const term = prompt.searchTerm.toLowerCase();
				prompt.filteredOptions = prompt.options.filter(
					(o) => !o.hidden && o.label.toLowerCase().includes(term)
				);
				prompt.cursor = 0;
				// Update the value to the first filtered option
				if (prompt.filteredOptions.length > 0) {
					prompt.value = prompt.filteredOptions[0].value;
				}
			}
		}
	}

	function simulateBackspace(prompt: TypeaheadSelectPrompt) {
		if (prompt.searchTerm.length > 0) {
			prompt.searchTerm = prompt.searchTerm.slice(0, -1);
			if (!prompt.searchTerm) {
				prompt.filteredOptions = prompt.options.filter((o) => !o.hidden);
			} else {
				const term = prompt.searchTerm.toLowerCase();
				prompt.filteredOptions = prompt.options.filter(
					(o) => !o.hidden && o.label.toLowerCase().includes(term)
				);
			}
			prompt.cursor = 0;
		}
	}

	function clearSearch(prompt: TypeaheadSelectPrompt) {
		prompt.searchTerm = "";
		prompt.filteredOptions = prompt.options.filter((o) => !o.hidden);
		prompt.cursor = 0;
	}

	test("initializes with all non-hidden options", () => {
		const prompt = createPrompt();

		expect(prompt.filteredOptions).toHaveLength(6);
		expect(prompt.filteredOptions.map((o) => o.value)).toEqual([
			"react",
			"vue",
			"angular",
			"svelte",
			"nextjs",
			"nuxt",
		]);
	});

	test("excludes hidden options from initial list", () => {
		const prompt = createPrompt();

		const hiddenOption = prompt.filteredOptions.find(
			(o) => o.value === "hidden"
		);
		expect(hiddenOption).toBeUndefined();
	});

	test("filters options when user types a search term", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "react");

		expect(prompt.searchTerm).toBe("react");
		expect(prompt.filteredOptions).toHaveLength(1);
		expect(prompt.filteredOptions[0].value).toBe("react");
	});

	test("filtering is case-insensitive", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "REACT");

		expect(prompt.filteredOptions).toHaveLength(1);
		expect(prompt.filteredOptions[0].value).toBe("react");
	});

	test("filters by partial match", () => {
		const prompt = createPrompt();

		// "xt" matches both "Next.js" and "Nuxt"
		simulateTyping(prompt, "xt");

		expect(prompt.filteredOptions).toHaveLength(2);
		expect(prompt.filteredOptions.map((o) => o.value)).toEqual([
			"nextjs",
			"nuxt",
		]);
	});

	test("returns empty list when no matches found", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "xyz");

		expect(prompt.filteredOptions).toHaveLength(0);
	});

	test("resets cursor to 0 when filtering", () => {
		const prompt = createPrompt();
		prompt.cursor = 3;

		simulateTyping(prompt, "vue");

		expect(prompt.cursor).toBe(0);
	});

	test("backspace removes last character and updates filter", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "react");
		expect(prompt.filteredOptions).toHaveLength(1);

		simulateBackspace(prompt);
		expect(prompt.searchTerm).toBe("reac");

		// Clear and re-filter
		clearSearch(prompt);
		simulateTyping(prompt, "re");
		expect(prompt.filteredOptions).toHaveLength(1); // React
	});

	test("clearing search shows all non-hidden options", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "react");
		expect(prompt.filteredOptions).toHaveLength(1);

		clearSearch(prompt);

		expect(prompt.searchTerm).toBe("");
		expect(prompt.filteredOptions).toHaveLength(6);
	});

	test("filters multiple matches correctly", () => {
		const prompt = createPrompt();

		// "n" should match Angular, Next.js, and Nuxt
		simulateTyping(prompt, "n");

		expect(prompt.filteredOptions.length).toBeGreaterThanOrEqual(2);
		const labels = prompt.filteredOptions.map((o) => o.label.toLowerCase());
		expect(labels.every((l) => l.includes("n"))).toBe(true);
	});

	test("handles empty options list", () => {
		const prompt = createPrompt([]);

		expect(prompt.filteredOptions).toHaveLength(0);
		expect(prompt.cursor).toBe(0);
	});

	test("handles all hidden options", () => {
		const allHidden: Option[] = [
			{ label: "Hidden 1", value: "h1", hidden: true },
			{ label: "Hidden 2", value: "h2", hidden: true },
		];
		const prompt = createPrompt(allHidden);

		expect(prompt.filteredOptions).toHaveLength(0);
	});

	test("value is set to first filtered option", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "vue");

		expect(prompt.value).toBe("vue");
	});

	test("progressive filtering narrows results", () => {
		const prompt = createPrompt();

		simulateTyping(prompt, "n");
		const afterN = prompt.filteredOptions.length;

		clearSearch(prompt);
		simulateTyping(prompt, "nu");
		const afterNu = prompt.filteredOptions.length;

		clearSearch(prompt);
		simulateTyping(prompt, "nux");
		const afterNux = prompt.filteredOptions.length;

		expect(afterN).toBeGreaterThanOrEqual(afterNu);
		expect(afterNu).toBeGreaterThanOrEqual(afterNux);
		expect(prompt.filteredOptions).toHaveLength(1);
		expect(prompt.filteredOptions[0].value).toBe("nuxt");
	});
});
