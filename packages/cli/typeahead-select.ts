import { Prompt } from "@clack/core";
import type { SelectPrompt } from "@clack/core";

export type Option = {
	label: string;
	value: string;
	description?: string;
	hidden?: boolean;
	activeIcon?: string;
	inactiveIcon?: string;
};

export type TypeaheadSelectOptions = ConstructorParameters<
	typeof SelectPrompt<Option>
>[0] & {
	options: Option[];
};

export default class TypeaheadSelectPrompt extends Prompt {
	options: Option[];
	filteredOptions: Option[];
	cursor = 0;
	searchTerm = "";

	private get _value() {
		return this.filteredOptions[this.cursor];
	}

	private changeValue() {
		if (this.filteredOptions.length > 0) {
			this.value = this._value?.value;
		}
	}

	private filterOptions() {
		if (!this.searchTerm) {
			this.filteredOptions = this.options.filter((o) => !o.hidden);
		} else {
			const term = this.searchTerm.toLowerCase();
			this.filteredOptions = this.options.filter(
				(o) => !o.hidden && o.label.toLowerCase().includes(term)
			);
		}
		// Reset cursor to first item when filtering
		this.cursor = 0;
		this.changeValue();
	}

	constructor(opts: TypeaheadSelectOptions) {
		super(opts, false);

		this.options = opts.options;
		this.filteredOptions = this.options.filter((o) => !o.hidden);
		this.cursor = this.filteredOptions.findIndex(
			({ value }) => value === opts.initialValue
		);
		if (this.cursor === -1) {
			this.cursor = 0;
		}
		this.changeValue();

		this.on("cursor", (key) => {
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
			}

			this.changeValue();
		});

		this.on("key", (char: string) => {
			// Handle backspace
			if (char === "\x7f" || char === "\b") {
				if (this.searchTerm.length > 0) {
					this.searchTerm = this.searchTerm.slice(0, -1);
					this.filterOptions();
				}
				return;
			}

			// Handle escape - clear search
			if (char === "\x1b") {
				this.searchTerm = "";
				this.filterOptions();
				return;
			}

			// Only handle printable characters (letters, numbers, spaces, etc.)
			// Ignore control characters
			if (char && char.length === 1 && char.charCodeAt(0) >= 32) {
				this.searchTerm += char;
				this.filterOptions();
			}
		});
	}
}
