import {
	ConfirmPrompt,
	isCancel,
	MultiSelectPrompt,
	Prompt,
	SelectPrompt,
	TextPrompt,
} from "@clack/core";
import { createLogUpdate } from "log-update";
import { blue, bold, brandColor, dim, gray, white } from "./colors";
import { cancel, newline, shapes, space, status } from "./index";
import SelectRefreshablePrompt, { OptionWithDetails } from "./select-list";

const logUpdate = createLogUpdate(process.stdout);

export type Arg = string | boolean | string[] | undefined | number;
const grayBar = gray(shapes.bar);
const blCorner = gray(shapes.corners.bl);
const leftT = gray(shapes.leftT);

export type Option = {
	label: string;
	value: string;
	hidden?: boolean;
};

export type BasePromptConfig = {
	// Displayed to the user while prompting for this input
	question: string;
	// Further clarifies the question
	helpText?: string;
	// The value to use by default
	defaultValue?: string | boolean | string[];
	// The status label to be shown after submitting
	label: string;
	// Pretty-prints the value in the interactive prompt
	format?: (value: Arg) => string;
	// Returns a user displayed error if the value is invalid
	validate?: (value: Arg) => string | void;
};

export type TextPromptConfig = BasePromptConfig & {
	type: "text";
	initialValue?: string;
};
export type BaseSelectPromptConfig =
	| BasePromptConfig & {
			options: Option[];
			maxItemsPerPage?: number;
	  };

export type SelectPromptConfig =
	| BaseSelectPromptConfig & {
			type: "select";
	  };

export type MultiSelectPromptConfig = BaseSelectPromptConfig & {
	type: "multiselect";
};

export type ConfirmPromptConfig =
	| BasePromptConfig & {
			type: "confirm";
			activeText?: string;
			inactiveText?: string;
	  };

export type ListPromptConfig = BasePromptConfig & {
	type: "list";
	options: OptionWithDetails[];
	onRefresh?: () => Promise<OptionWithDetails[]>;
};

export type PromptConfig =
	| TextPromptConfig
	| ConfirmPromptConfig
	| SelectPromptConfig
	| MultiSelectPromptConfig
	| ListPromptConfig;

type RenderProps =
	| Omit<SelectPrompt<Option>, "prompt">
	| Omit<MultiSelectPrompt<Option>, "prompt">
	| Omit<TextPrompt, "prompt">
	| Omit<ConfirmPrompt, "prompt">
	| Omit<SelectRefreshablePrompt, "prompt">;

export const inputPrompt = async <T = string>(promptConfig: PromptConfig) => {
	const renderers = getRenderers(promptConfig);

	let prompt:
		| SelectPrompt<Option>
		| TextPrompt
		| ConfirmPrompt
		| MultiSelectPrompt<Option>
		| SelectRefreshablePrompt;

	// Looks up the needed renderer by the current state ('initial', 'submitted', etc.)
	const dispatchRender = (props: RenderProps, p: Prompt): string | void => {
		const renderedLines = renderers[props.state](props, p);
		return renderedLines.join("\n");
	};

	if (promptConfig.type === "select") {
		prompt = new SelectPrompt({
			...promptConfig,
			initialValue: String(promptConfig.defaultValue),
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else if (promptConfig.type === "confirm") {
		prompt = new ConfirmPrompt({
			...promptConfig,
			initialValue: Boolean(promptConfig.defaultValue),
			active: promptConfig.activeText || "",
			inactive: promptConfig.inactiveText || "",
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else if (promptConfig.type == "multiselect") {
		let initialValues: string[] | undefined;
		if (Array.isArray(promptConfig.defaultValue)) {
			initialValues = promptConfig.defaultValue;
		} else if (promptConfig.defaultValue !== undefined) {
			initialValues = [String(promptConfig.defaultValue)];
		}
		prompt = new MultiSelectPrompt({
			...promptConfig,
			options: promptConfig.options,
			initialValues: initialValues,
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else if (promptConfig.type === "list") {
		prompt = new SelectRefreshablePrompt({
			...promptConfig,
			onRefresh:
				promptConfig.onRefresh ?? (() => Promise.resolve(promptConfig.options)),
			initialValue: String(promptConfig.defaultValue),
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else {
		prompt = new TextPrompt({
			...promptConfig,
			initialValue: promptConfig.initialValue,
			defaultValue: String(promptConfig.defaultValue),
			render() {
				return dispatchRender(this, prompt);
			},
		});
	}

	const input = (await prompt.prompt()) as T;

	if (isCancel(input)) {
		cancel("Operation cancelled.");
		process.exit(0);
	}

	return input;
};

type Renderer = (
	props: {
		state?: string;
		error?: string;
		cursor?: number;
		value: Arg;
	},
	prompt: Prompt
) => string[];

const renderSubmit = (config: PromptConfig, value: string) => {
	const { question, label } = config;

	if (config.type !== "confirm" && value.length === 0) {
		return [`${leftT} ${question} ${dim("(skipped)")}`, `${grayBar}`];
	}

	const content =
		config.type === "confirm"
			? `${grayBar} ${brandColor(value)} ${dim(label)}`
			: `${grayBar} ${brandColor(label)} ${dim(value)}`;

	return [`${leftT} ${question}`, content, `${grayBar}`];
};

const handleCancel = () => {
	cancel("Operation cancelled.");
	process.exit(0);
};

export const getRenderers = (config: PromptConfig) => {
	switch (config.type) {
		case "select":
			return getSelectRenderers(config);
		case "confirm":
			return getConfirmRenderers(config);
		case "text":
			return getTextRenderers(config);
		case "multiselect":
			return getSelectRenderers(config);
		case "list":
			return getSelectListRenderers(config);
	}
};

const getTextRenderers = (config: TextPromptConfig) => {
	const {
		defaultValue,
		question,
		helpText: _helpText,
		format: _format,
	} = config;
	const helpText = _helpText ?? "";
	const format = _format ?? ((val: Arg) => String(val));

	return {
		initial: () => [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${space(2)}${gray(format(defaultValue))}`,
			``, // extra line for readability
		],
		active: ({ value }: { value: Arg }) => [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${space(2)}${format(
				value || dim(typeof defaultValue === "string" ? defaultValue : ``)
			)}`,
			``, // extra line for readability
		],
		error: ({ value, error }: { value: Arg; error: string }) => [
			`${leftT} ${status.error} ${dim(error)}`,
			`${grayBar}`,
			`${blCorner} ${question} ${dim(helpText)}`,
			`${space(2)}${format(value)}`,
			``, // extra line for readability
		],
		submit: ({ value }: { value: Arg }) => renderSubmit(config, format(value)),
		cancel: handleCancel,
	};
};

const getSelectRenderers = (
	config: SelectPromptConfig | MultiSelectPromptConfig
) => {
	const { options, question, helpText: _helpText } = config;
	const helpText = _helpText ?? "";
	const maxItemsPerPage = config.maxItemsPerPage ?? 32;

	const defaultRenderer: Renderer = ({ cursor, value }) => {
		cursor = cursor ?? 0;
		const renderOption = (opt: Option, i: number) => {
			const { label: optionLabel, value: optionValue } = opt;
			const active = i === cursor;
			const isInListOfValues =
				Array.isArray(value) && value.includes(optionValue);
			const color = isInListOfValues || active ? blue : dim;
			const text = active ? color.underline(optionLabel) : color(optionLabel);

			const indicator =
				isInListOfValues || (active && !Array.isArray(value))
					? color(shapes.radioActive)
					: color(shapes.radioInactive);

			return `${space(2)}${indicator} ${text}`;
		};

		const renderOptionCondition = (_: unknown, i: number): boolean => {
			if (options.length <= maxItemsPerPage) {
				return true;
			}

			cursor = cursor ?? 0;
			if (i < cursor) {
				return options.length - i <= maxItemsPerPage;
			}

			if (i >= cursor && cursor + maxItemsPerPage > i) {
				return true;
			}

			return false;
		};

		return [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${
				cursor > 0 && options.length > maxItemsPerPage
					? `${space(2)}${dim("...")}\n`
					: ""
			}${options
				.filter((o) => !o.hidden)
				.map(renderOption)
				.filter(renderOptionCondition)
				.join(`\n`)}${
				cursor + maxItemsPerPage < options.length &&
				options.length > maxItemsPerPage
					? `\n${space(2)}${dim("...")}`
					: ""
			}`,
			``, // extra line for readability
		];
	};

	return {
		initial: defaultRenderer,
		active: defaultRenderer,
		confirm: defaultRenderer,
		error: (opts: { value: Arg; error: string }, prompt: Prompt) => {
			return [
				`${leftT} ${status.error} ${dim(opts.error)}`,
				`${grayBar}`,
				...defaultRenderer(opts, prompt),
			];
		},
		submit: ({ value }: { value: Arg }) => {
			if (Array.isArray(value)) {
				return renderSubmit(
					config,
					options
						.filter((o) => value.includes(o.value))
						.map((o) => o.label)
						.join(", ")
				);
			}

			return renderSubmit(
				config,
				options.find((o) => o.value === value)?.label as string
			);
		},
		cancel: handleCancel,
	};
};

const getSelectListRenderers = (config: ListPromptConfig) => {
	const { question, helpText: _helpText } = config;
	let options = config.options;
	const helpText = _helpText ?? "";
	const { rows } = process.stdout;
	const defaultRenderer: Renderer = ({ cursor, value }, prompt: Prompt) => {
		if (prompt instanceof SelectRefreshablePrompt) {
			options = prompt.options;
		}

		cursor = cursor ?? 0;
		let smallCursor = 0;
		const renderOption = (opt: OptionWithDetails, i: number) => {
			const { label: optionLabel, value: optionValueAny } = opt;
			const optionValue = optionValueAny.toString() as string;
			const active = i === smallCursor;
			const isInListOfValues =
				Array.isArray(value) && value.includes(optionValue);
			const color = isInListOfValues || active ? blue : white;
			const text = active
				? color.underline(optionLabel?.toString() ?? "")
				: color(optionLabel?.toString() ?? "");

			const indicator =
				isInListOfValues || (active && !Array.isArray(value))
					? color(shapes.radioActive)
					: color(shapes.radioInactive);

			return [
				`${space(2)}${indicator} ${text}`,
				...opt.details.map(
					(detail, j) =>
						`${space(6)}${
							j === opt.details.length - 1 ? gray(shapes.corners.bl) : grayBar
						} ${detail}`
				),
			];
		};

		// Create the pages, later on we  will choose a "page" that the user can
		// navigate on the view
		const pages: OptionWithDetails[][] = [];
		let current: { size: number; options: OptionWithDetails[] } = {
			size: 0,
			options: [],
		};
		for (let index = 0; index < options.length; index++) {
			const option = options[index];
			if (current.size + option.details.length + 1 > rows - 6) {
				pages.push(current.options);
				current = { size: option.details.length + 1, options: [option] };
				continue;
			}

			current.size += option.details.length + 1;
			current.options.push(option);
		}

		// add the last current
		if (current.size !== 0) {
			pages.push(current.options);
		}

		// choose a page by finding the page that the current cursor is in
		let isFirstPage = true;
		let isLastPage = false;
		let page: OptionWithDetails[] = [];
		let len = 0;
		for (let i = 0; i < pages.length; i++) {
			const pageIter = pages[i];
			if (cursor >= len && pageIter.length + len > cursor) {
				isFirstPage = i === 0;
				isLastPage = i === pages.length - 1;
				page = pageIter;
				smallCursor = cursor - len;
				break;
			}

			len += pageIter.length;
		}

		return [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			...(!isFirstPage ? [`${space(2)}${dim("...")}`] : []),
			...page.map(renderOption).reduce((prev, now) => [...prev, ...now], []),
			...(!isLastPage ? [`${space(2)}${dim("...")}`] : []),
		];
	};

	return {
		initial: defaultRenderer,
		active: defaultRenderer,
		confirm: defaultRenderer,
		error: (opts: { value: Arg; error: string }, prompt: Prompt) => {
			return [
				`${leftT} ${status.error} ${dim(opts.error)}`,
				`${grayBar}`,
				...defaultRenderer(opts, prompt),
			];
		},
		submit: ({ value }: { value: Arg }) => {
			if (Array.isArray(value)) {
				return renderSubmit(
					config,
					options
						.filter((o) => value.includes(o.value))
						.map((o) => o.value)
						.join(", ")
				);
			}

			return renderSubmit(
				config,
				options.find((o) => o.value === value)?.value as string
			);
		},
		cancel: handleCancel,
	};
};

const getConfirmRenderers = (config: ConfirmPromptConfig) => {
	const { activeText, inactiveText, question, helpText: _helpText } = config;
	const helpText = _helpText ?? "";

	const active = activeText || "Yes";
	const inactive = inactiveText || "No";

	const defaultRenderer: Renderer = ({ value }) => {
		const yesColor = value ? blue.underline : dim;
		const noColor = value ? dim : blue.underline;
		return [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${space(2)}${yesColor(active)} / ${noColor(inactive)}`,
		];
	};

	return {
		initial: defaultRenderer,
		active: defaultRenderer,
		confirm: defaultRenderer,
		error: defaultRenderer,
		submit: ({ value }: { value: Arg }) =>
			renderSubmit(config, value ? "yes" : "no"),
		cancel: handleCancel,
	};
};

export type SpinnerStyle = keyof typeof spinnerFrames;

export const spinnerFrames = {
	clockwise: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
	vertical: ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"],
};

const ellipsisFrames = ["", ".", "..", "...", " ..", "  .", ""];

export const spinner = (
	frames: string[] = spinnerFrames.clockwise,
	color: typeof brandColor = brandColor
) => {
	// Alternative animations we considered. Keeping around in case we
	// introduce different animations for different use cases.
	// const frames = ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"];
	// const frames = ["■", "□", "▪", "▫"];
	// const frames = ["✶", "✸", "✹", "✺", "✹", "✷"];
	// const frames = ["◜", "◠", "◝", "◞", "◡", "◟"];
	// const frames = ["◐", "◓", "◑", "◒"];
	// const frames = ["㊂", "㊀", "㊁"];

	const frameRate = 120;
	let loop: NodeJS.Timer | null = null;
	let startMsg: string;
	let currentMsg: string;

	function clearLoop() {
		if (loop) {
			clearTimeout(loop);
		}
		loop = null;
	}

	return {
		start(msg: string, helpText?: string) {
			helpText ||= ``;
			currentMsg = msg;
			startMsg = `${currentMsg} ${dim(helpText)}`;

			if (isInteractive()) {
				let index = 0;

				clearLoop();
				loop = setInterval(() => {
					index++;
					const spinnerFrame = frames[index % frames.length];
					const ellipsisFrame = ellipsisFrames[index % ellipsisFrames.length];

					if (msg) {
						logUpdate(`${color(spinnerFrame)} ${currentMsg} ${ellipsisFrame}`);
					}
				}, frameRate);
			} else {
				logUpdate(`${leftT} ${startMsg}`);
			}
		},
		update(msg: string) {
			currentMsg = msg;
		},
		stop(msg?: string) {
			if (isInteractive()) {
				// Write the final message and clear the loop
				logUpdate.clear();
				if (msg) {
					logUpdate(`${leftT} ${startMsg}\n${grayBar} ${msg}`);
					logUpdate.done();
					newline();
				}
				clearLoop();
			} else {
				logUpdate(`\n${grayBar} ${msg}`);
				newline();
			}
		},
	};
};

export const isInteractive = () => {
	return process.stdin.isTTY;
};
