import { Prompt } from "@clack/core";
import { stripAnsi } from ".";

export type SearchableOption = {
	label: string;
	value: string;
	sublabel?: string;
	searchText?: string[];
};

export type MultiSelectSearchOptions = {
	options: SearchableOption[];
	initialValues?: string[];
	render(this: Omit<MultiSelectSearchPrompt, "prompt">): string | void;
	validate?: (value: string[] | undefined) => string | void;
};

type PromptInternals = {
	onKeypress: (char?: string, key?: { name?: string }) => void;
	render: () => void;
	close: () => void;
	opts: {
		validate?: (value: string[] | undefined) => string | void;
	};
	rl?: {
		write: (value: string[]) => void;
	};
};

const CURSOR_KEYS = new Set(["up", "down", "left", "right", "space", "enter"]);

const normalizeSearchText = (text: string | undefined): string | undefined => {
	if (!text) {
		return undefined;
	}

	const normalized = stripAnsi(text)
		.replace(/[\u200A\u200B]/g, "")
		.replace(/\s+/g, " ")
		.trim();

	return normalized.length > 0 ? normalized : undefined;
};

const getMatchPriority = (text: string | undefined, query: string): number | null => {
	if (!text) {
		return null;
	}

	const normalized = text.toLowerCase();
	if (normalized === query) {
		return 0;
	}

	if (normalized.startsWith(query)) {
		return 1;
	}

	if (normalized.includes(query)) {
		return 2;
	}

	return null;
};

const getOptionPriority = (option: SearchableOption, query: string): number | null => {
	const priorities = [
		getMatchPriority(option.value, query),
		getMatchPriority(option.label, query),
		...(option.searchText ?? []).map((text) => getMatchPriority(text, query)),
		getMatchPriority(normalizeSearchText(option.sublabel), query),
	].filter((priority): priority is number => priority !== null);

	if (priorities.length === 0) {
		return null;
	}

	return Math.min(...priorities);
};

/**
 * A multiselect prompt with type-to-search filtering.
 *
 * - Arrow keys navigate the filtered list
 * - SPACE toggles selection on the focused item
 * - Typing narrows the visible options (matches against label, value, and sublabel)
 * - Backspace removes the last character from the search query
 * - ENTER submits
 *
 * `this.search` contains the current search text.
 * `this.filteredOptions` contains the options matching the search.
 * `this.selectedValues` is the array of selected option values.
 * `this.cursor` is the index into `filteredOptions`.
 * `this.windowStart` tracks the scroll position for the sliding window.
 */
export default class MultiSelectSearchPrompt extends Prompt {
	options: SearchableOption[];
	filteredOptions: SearchableOption[];
	cursor = 0;
	search = "";
	windowStart = 0;

	get selectedValues(): string[] {
		return this.value as string[];
	}

	set selectedValues(v: string[]) {
		this.value = v;
	}

	constructor(opts: MultiSelectSearchOptions) {
		super(opts, false);

		const prompt = this as unknown as PromptInternals;
		prompt.onKeypress = (char: string | undefined, key?: { name?: string }) => {
			if (this.state === "error") {
				this.state = "active";
			}

			if (key?.name && CURSOR_KEYS.has(key.name)) {
				this.emit("cursor", key.name);
			}

			if (char) {
				this.emit("key", char.toLowerCase());
			}

			if (key?.name === "return") {
				if (prompt.opts.validate) {
					const error = prompt.opts.validate(this.value);
					if (error) {
						this.error = error;
						this.state = "error";
						prompt.rl?.write(this.value);
					}
				}

				if (this.state !== "error") {
					this.state = "submit";
				}
			}

			if (char === "\u0003" || key?.name === "escape") {
				this.state = "cancel";
			}

			if (this.state === "submit" || this.state === "cancel") {
				this.emit("finalize");
			}

			prompt.render();

			if (this.state === "submit" || this.state === "cancel") {
				prompt.close();
			}
		};

		this.options = opts.options;
		this.selectedValues = [...(opts.initialValues ?? [])];
		this.filteredOptions = [...this.options];
		this.cursor = 0;

		this.on("cursor", (key: string) => {
			switch (key) {
				case "left":
				case "up":
					if (this.filteredOptions.length === 0) {
						break;
					}
					this.cursor =
						this.cursor === 0
							? this.filteredOptions.length - 1
							: this.cursor - 1;
					break;
				case "down":
				case "right":
					if (this.filteredOptions.length === 0) {
						break;
					}
					this.cursor =
						this.cursor === this.filteredOptions.length - 1
							? 0
							: this.cursor + 1;
					break;
				case "space": {
					if (this.filteredOptions.length === 0) {
						break;
					}

					const toggledValue = this.filteredOptions[this.cursor]?.value;
					this.toggleValue();
					// Clear search after toggling so the full list reappears
					// and the user can immediately search for the next version
					this.search = "";
					this.applyFilter();
					if (toggledValue !== undefined) {
						const nextCursor = this.filteredOptions.findIndex(
							(option) => option.value === toggledValue
						);
						this.cursor = nextCursor === -1 ? 0 : nextCursor;
					}
					break;
				}
			}
		});

		this.on("key", (char: string) => {
			// Backspace / DEL — remove last search character
			if (char === "\x7F" || char === "\b") {
				if (this.search.length > 0) {
					this.search = this.search.slice(0, -1);
					this.applyFilter({ resetFocus: true });
					this.rerender();
				}
				return;
			}

			// Printable character - append to search
			// Exclude space (used for toggling) and control characters
			if (char.length === 1 && char >= " " && char !== " ") {
				this.search += char;
				this.applyFilter({ resetFocus: true });
				this.rerender();
			}
		});
	}

	private toggleValue(): void {
		if (this.filteredOptions.length === 0) {
			return;
		}

		const opt = this.filteredOptions[this.cursor];
		const idx = this.selectedValues.indexOf(opt.value);

		if (idx === -1) {
			this.selectedValues = [...this.selectedValues, opt.value];
		} else {
			this.selectedValues = this.selectedValues.filter(
				(v) => v !== opt.value
			);
		}
	}

	private applyFilter({ resetFocus = false }: { resetFocus?: boolean } = {}): void {
		const query = this.search.toLowerCase();

		if (query === "") {
			this.filteredOptions = [...this.options];
		} else {
			this.filteredOptions = this.options
				.map((option, index) => ({
					option,
					index,
					priority: getOptionPriority(option, query),
				}))
				.filter(
					(result): result is { option: SearchableOption; index: number; priority: number } =>
						result.priority !== null
				)
				.sort(
					(a, b) => a.priority - b.priority || a.index - b.index
				)
				.map(({ option }) => option);
		}

		if (resetFocus) {
			this.cursor = 0;
			this.windowStart = 0;
			return;
		}

		// Keep cursor in bounds
		if (this.cursor >= this.filteredOptions.length) {
			this.cursor = Math.max(0, this.filteredOptions.length - 1);
		}
	}

	private rerender(): void {
		// Workaround: render is private in Prompt, but we need to trigger a re-render
		const self = this as Record<string, unknown>;
		if ("render" in self && typeof self.render === "function") {
			self.render();
		}
	}
}
