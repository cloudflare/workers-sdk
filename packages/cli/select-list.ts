import type { SelectPrompt } from "@clack/core";

import { Prompt } from "@clack/core";

export type Option = {
	label: string;
	value: string;
};

export type OptionWithDetails = Option & {
	details: string[];
};

export type SelectRefreshableOptions = ConstructorParameters<
	typeof SelectPrompt<Option>
>[0] & {
	onRefresh: () => Promise<OptionWithDetails[]>;
} & {
	options: OptionWithDetails[];
};

export default class SelectRefreshablePrompt extends Prompt {
	options: OptionWithDetails[];
	cursor = 0;

	private get _value() {
		return this.options[this.cursor];
	}

	private changeValue() {
		this.value = this._value.value;
	}

	constructor(opts: SelectRefreshableOptions) {
		super(opts, false);

		this.options = opts.options;
		this.cursor = this.options.findIndex(
			({ value }) => value === opts.initialValue
		);
		if (this.cursor === -1) {
			this.cursor = 0;
		}
		this.changeValue();

		this.on("key", (c) => {
			if (c !== "r") {
				return;
			}
			void opts
				.onRefresh()
				.then((newOptions) => {
					this.options = [...newOptions];
					this.cursor = 0;
					this.changeValue();
					// Workaround: so 'render' is private in Prompt, but we know what we're doing here (right?) so
					// let's just access it anyway.
					const that = this as Record<string, unknown>;
					if ("render" in that && typeof that.render === "function") {
						that.render();
					}
				})
				.catch(() => {});
		});

		this.on("cursor", (key) => {
			switch (key) {
				case "left":
				case "up":
					this.cursor =
						this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
					break;
				case "down":
				case "right":
					this.cursor =
						this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
					break;
			}

			this.changeValue();
		});
	}
}
