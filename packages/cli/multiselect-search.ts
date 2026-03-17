import { Prompt } from "@clack/core";

export type SearchableOption = {
	label: string;
	value: string;
	sublabel?: string;
};

export type MultiSelectSearchOptions = {
	options: SearchableOption[];
	initialValues?: string[];
	render(this: Omit<MultiSelectSearchPrompt, "prompt">): string | void;
	validate?: (value: string[] | undefined) => string | void;
};

// Keys that @clack/core maps to cursor events when trackValue is false.
// These are emitted as both "cursor" and "key" events, so we must ignore
// them in the "key" handler to avoid double-handling (navigate + search append).
const VIM_NAV_KEYS = new Set(["h", "j", "k", "l"]);

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

		this.options = opts.options;
		this.selectedValues = [...(opts.initialValues ?? [])];
		this.filteredOptions = [...this.options];
		this.cursor = 0;

		this.on("cursor", (key: string) => {
			switch (key) {
				case "left":
				case "up":
					this.cursor =
						this.cursor === 0
							? this.filteredOptions.length - 1
							: this.cursor - 1;
					break;
				case "down":
				case "right":
					this.cursor =
						this.cursor === this.filteredOptions.length - 1
							? 0
							: this.cursor + 1;
					break;
				case "space":
					this.toggleValue();
					// Clear search after toggling so the full list reappears
					// and the user can immediately search for the next version
					this.search = "";
					this.applyFilter();
					break;
			}
		});

		this.on("key", (char: string) => {
			// Backspace / DEL — remove last search character
			if (char === "\x7F" || char === "\b") {
				if (this.search.length > 0) {
					this.search = this.search.slice(0, -1);
					this.applyFilter();
					this.rerender();
				}
				return;
			}

			// Ignore vim navigation keys (h/j/k/l) — they are already handled
			// by the "cursor" event and would otherwise be appended to search.
			if (VIM_NAV_KEYS.has(char)) {
				return;
			}

			// Printable character — append to search
			// Exclude space (used for toggling) and control characters
			if (char.length === 1 && char >= " " && char !== " ") {
				this.search += char;
				this.applyFilter();
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

	private applyFilter(): void {
		const query = this.search.toLowerCase();

		if (query === "") {
			this.filteredOptions = [...this.options];
		} else {
			this.filteredOptions = this.options.filter((opt) => {
				return (
					opt.label.toLowerCase().includes(query) ||
					opt.value.toLowerCase().includes(query) ||
					(opt.sublabel?.toLowerCase().includes(query) ?? false)
				);
			});
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
