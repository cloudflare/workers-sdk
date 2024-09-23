import {
	ConfirmPrompt,
	isCancel,
	MultiSelectPrompt,
	SelectPrompt,
	TextPrompt,
} from "@clack/core";
import { createLogUpdate } from "log-update";
import { blue, bold, brandColor, dim, gray, white } from "./colors";
import { CancelError } from "./error";
import SelectRefreshablePrompt from "./select-list";
import { stdout } from "./streams";
import {
	cancel,
	crash,
	logRaw,
	newline,
	shapes,
	space,
	status,
	stripAnsi,
} from "./index";
import type { OptionWithDetails } from "./select-list";
import type { Prompt } from "@clack/core";

const logUpdate = createLogUpdate(stdout);

export type Arg = string | boolean | string[] | undefined | number;
export const grayBar = gray(shapes.bar);
export const blCorner = gray(shapes.corners.bl);
export const leftT = gray(shapes.leftT);

export type Option = {
	label: string; // user-visible string
	sublabel?: string; // user-visible string
	description?: string;
	value: string; // underlying key
	hidden?: boolean;
	activeIcon?: string;
	inactiveIcon?: string;
};

export type BasePromptConfig = {
	// Displayed to the user while prompting for this input
	question: string;
	// Further clarifies the question
	helpText?: string;
	// The value to use by default
	defaultValue?: Arg;
	// Accept the initialValue/defaultValue as if the user pressed ENTER when prompted
	acceptDefault?: boolean;
	// The status label to be shown after submitting
	label: string;
	// Pretty-prints the value in the interactive prompt
	format?: (value: Arg) => string;
	// Returns a user displayed error if the value is invalid
	validate?: (value: Arg) => string | void;
	// Override some/all renderers (can be used for custom renderers before hoisting back into shared code)
	renderers?: Partial<ReturnType<typeof getRenderers>>;
	// Whether to throw an error if the prompt is crashed or cancelled
	throwOnError?: boolean;
};

export type TextPromptConfig = BasePromptConfig & {
	type: "text";
	initialValue?: string;
};
export type BaseSelectPromptConfig = BasePromptConfig & {
	options: Option[];
	maxItemsPerPage?: number;
};

export type SelectPromptConfig = BaseSelectPromptConfig & {
	type: "select";
};

export type MultiSelectPromptConfig = BaseSelectPromptConfig & {
	type: "multiselect";
};

export type ConfirmPromptConfig = BasePromptConfig & {
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

function acceptDefault<T>(
	promptConfig: PromptConfig,
	renderers: Pick<ReturnType<typeof getRenderers>, "submit">,
	initialValue: T
): T {
	const error = promptConfig.validate?.(initialValue as Arg);
	if (error) {
		if (promptConfig.throwOnError) {
			throw new Error(error);
		} else {
			crash(error);
		}
	}

	const lines = renderers.submit({ value: initialValue as Arg });
	logRaw(lines.join("\n"));

	return initialValue as T;
}

export const inputPrompt = async <T = string>(
	promptConfig: PromptConfig
): Promise<T> => {
	const renderers = {
		...getRenderers(promptConfig),
		...promptConfig.renderers,
	};

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
		const initialValue = String(promptConfig.defaultValue);

		if (promptConfig.acceptDefault) {
			return acceptDefault<T>(promptConfig, renderers, initialValue as T);
		}

		prompt = new SelectPrompt({
			...promptConfig,
			options: promptConfig.options.filter((o) => !o.hidden),
			initialValue,
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else if (promptConfig.type === "confirm") {
		const initialValue = Boolean(promptConfig.defaultValue);

		if (promptConfig.acceptDefault) {
			return acceptDefault<T>(promptConfig, renderers, initialValue as T);
		}

		prompt = new ConfirmPrompt({
			...promptConfig,
			initialValue,
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

		if (promptConfig.acceptDefault) {
			return acceptDefault<T>(promptConfig, renderers, initialValues as T);
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
		const initialValue = String(promptConfig.defaultValue);

		if (promptConfig.acceptDefault) {
			return acceptDefault<T>(promptConfig, renderers, initialValue as T);
		}

		prompt = new SelectRefreshablePrompt({
			...promptConfig,
			onRefresh:
				promptConfig.onRefresh ?? (() => Promise.resolve(promptConfig.options)),
			initialValue,
			render() {
				return dispatchRender(this, prompt);
			},
		});
	} else {
		const initialValue =
			promptConfig.initialValue ?? String(promptConfig.defaultValue ?? "");

		if (promptConfig.acceptDefault) {
			return acceptDefault<T>(promptConfig, renderers, initialValue as T);
		}

		prompt = new TextPrompt({
			...promptConfig,
			initialValue: promptConfig.initialValue,
			defaultValue: String(promptConfig.defaultValue ?? ""),
			render() {
				return dispatchRender(this, prompt);
			},
		});
	}

	const input = (await prompt.prompt()) as T;

	if (isCancel(input)) {
		if (promptConfig.throwOnError) {
			throw new CancelError("Operation cancelled");
		} else {
			cancel("Operation cancelled");
			process.exit(0);
		}
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

	if (config.type !== "confirm" && !value) {
		return [`${leftT} ${question} ${dim("(skipped)")}`, `${grayBar}`];
	}

	const content =
		config.type === "confirm"
			? `${grayBar} ${brandColor(value)} ${dim(label)}`
			: `${grayBar} ${brandColor(label)} ${dim(value)}`;

	return [`${leftT} ${question}`, content, `${grayBar}`];
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
	const { question } = config;
	const helpText = config.helpText ?? "";
	const format = config.format ?? ((val: Arg) => String(val));
	const defaultValue = config.defaultValue?.toString() ?? "";
	const activeRenderer = ({ value }: { value: Arg }) => [
		`${blCorner} ${bold(question)} ${dim(helpText)}`,
		`${space(2)}${format(value || dim(defaultValue))}`,
		``, // extra line for readability
	];

	return {
		initial: () => [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${space(2)}${gray(format(defaultValue))}`,
			``, // extra line for readability
		],
		active: activeRenderer,
		error: ({ value, error }: { value: Arg; error: string }) => [
			`${leftT} ${status.error} ${dim(error)}`,
			`${grayBar}`,
			`${blCorner} ${question} ${dim(helpText)}`,
			`${space(2)}${format(value)}`,
			``, // extra line for readability
		],
		submit: ({ value }: { value: Arg }) =>
			renderSubmit(config, format(value ?? "")),
		cancel: activeRenderer,
	};
};

const getSelectRenderers = (
	config: SelectPromptConfig | MultiSelectPromptConfig
) => {
	const { options, question, helpText: _helpText } = config;
	const helpText = _helpText ?? "";
	const maxItemsPerPage = config.maxItemsPerPage ?? 32;

	const defaultRenderer: Renderer = ({ cursor = 0, value }) => {
		const renderOption = (opt: Option, i: number) => {
			const { label: optionLabel, value: optionValue } = opt;
			const active = i === cursor;
			const isInListOfValues =
				Array.isArray(value) && value.includes(optionValue);
			const color = isInListOfValues || active ? blue : white;
			const text = active ? color.underline(optionLabel) : color(optionLabel);
			const sublabel = opt.sublabel ? color.grey(opt.sublabel) : "";

			const indicator =
				isInListOfValues || (active && !Array.isArray(value))
					? color(opt.activeIcon ?? shapes.radioActive)
					: color(opt.inactiveIcon ?? shapes.radioInactive);

			return `${space(2)}${indicator} ${text} ${sublabel}`;
		};

		const renderOptionCondition = (_: unknown, i: number): boolean => {
			if (options.length <= maxItemsPerPage) {
				return true;
			}

			if (i < cursor) {
				return options.length - i <= maxItemsPerPage;
			}

			return cursor + maxItemsPerPage > i;
		};

		const visibleOptions = options.filter((o) => !o.hidden);
		const activeOption = visibleOptions.at(cursor);
		const lines = [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${
				cursor > 0 && options.length > maxItemsPerPage
					? `${space(2)}${dim("...")}\n`
					: ""
			}${visibleOptions
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

		if (activeOption?.description) {
			// To wrap the text by words instead of characters
			const wordSegmenter = new Intl.Segmenter("en", { granularity: "word" });
			const padding = space(2);
			const availableWidth =
				process.stdout.columns - stripAnsi(padding).length * 2;

			// The description cannot have any ANSI code
			// As the segmenter will split the code to several segments
			const description = stripAnsi(activeOption.description);
			const descriptionLines: string[] = [];
			let descriptionLineNumber = 0;

			for (const data of wordSegmenter.segment(description)) {
				let line = descriptionLines[descriptionLineNumber] ?? "";

				const currentLineWidth = line.length;
				const segmentSize = data.segment.length;

				if (currentLineWidth + segmentSize > availableWidth) {
					descriptionLineNumber++;
					line = "";

					// To avoid starting a new line with a space
					if (data.segment.match(/^\s+$/)) {
						continue;
					}
				}

				descriptionLines[descriptionLineNumber] = line + data.segment;
			}

			lines.push(
				dim(
					descriptionLines.map((line) => padding + line + padding).join("\n")
				),
				``
			);
		}

		return lines;
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
		cancel: defaultRenderer,
	};
};

const getSelectListRenderers = (config: ListPromptConfig) => {
	const { question, helpText: _helpText } = config;
	let options = config.options;
	const helpText = _helpText ?? "";
	const { rows } = stdout;
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
			const text = active ? color.underline(optionLabel) : color(optionLabel);

			const indicator =
				isInListOfValues || (active && !Array.isArray(value))
					? color(shapes.radioActive)
					: color(shapes.radioInactive);

			const indicatorMargin = 2;
			const detailBulletpointMargin = indicatorMargin + 4;
			return [
				`${space(indicatorMargin)}${indicator} ${text}`,
				...opt.details.map(
					(detail, j) =>
						`${space(detailBulletpointMargin)}${
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
		const VERTICAL_MARGIN = 6;
		for (const option of options) {
			// If current accumulation of options + title row + option details size
			// is bigger than console rows substracted by a bit of vertical margin,
			// add a new page.
			const optionHeight = option.details.length + 1;
			if (current.size + optionHeight > rows - VERTICAL_MARGIN) {
				pages.push(current.options);
				current = { size: optionHeight, options: [option] };
				continue;
			}

			current.size += optionHeight;
			current.options.push(option);
		}

		// add the last current as the last page
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
		cancel: defaultRenderer,
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
		cancel: defaultRenderer,
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
	let loop: ReturnType<typeof setTimeout> | null = null;
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
				if (msg !== undefined) {
					logUpdate(`\n${grayBar} ${msg}`);
				}
				newline();
			}
		},
	};
};

type FactoryOrValue<T> = T | (() => T);
const unwrapFactory = <T>(input: FactoryOrValue<T>): T => {
	const output = typeof input === "function" ? (input as () => T)() : input;
	return output;
};
export const spinnerWhile = async <T>(opts: {
	promise: FactoryOrValue<Promise<T>>;
	startMessage: FactoryOrValue<string>;
	endMessage?: FactoryOrValue<string>;
	spinner?: ReturnType<typeof spinner>;
}): Promise<T> => {
	const s = opts.spinner ?? spinner();

	s.start(unwrapFactory(opts.startMessage));

	try {
		const result = await unwrapFactory(opts.promise);

		return result;
	} finally {
		s.stop(unwrapFactory(opts.endMessage));
	}
};

export const isInteractive = () => {
	return process.stdin.isTTY;
};
