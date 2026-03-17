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
 * `this.value` is the array of selected option values.
 * `this.cursor` is the index into `filteredOptions`.
 */
export default class MultiSelectSearchPrompt extends Prompt {
	options: SearchableOption[];
	filteredOptions: SearchableOption[];
	cursor = 0;
	search = "";

	constructor(opts: MultiSelectSearchOptions) {
		super(opts, false);

		this.options = opts.options;
		this.value = [...(opts.initialValues ?? [])];
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

			if (char === "a" && this.search === "") {
				// Toggle all only when not searching (consistent with base MultiSelectPrompt)
				this.toggleAll();
				this.rerender();
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
		const idx = (this.value as string[]).indexOf(opt.value);

		if (idx === -1) {
			this.value = [...(this.value as string[]), opt.value];
		} else {
			this.value = (this.value as string[]).filter(
				(v: string) => v !== opt.value
			);
		}
	}

	private toggleAll(): void {
		const allValues = this.filteredOptions.map((o) => o.value);
		const allSelected = allValues.every((v) =>
			(this.value as string[]).includes(v)
		);

		if (allSelected) {
			this.value = (this.value as string[]).filter(
				(v: string) => !allValues.includes(v)
			);
		} else {
			this.value = Array.from(
				new Set([...(this.value as string[]), ...allValues])
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
