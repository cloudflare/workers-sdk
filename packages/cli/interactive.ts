import { ConfirmPrompt, SelectPrompt, TextPrompt } from "@clack/core";
import ansiEscapes from "ansi-escapes";
import logUpdate from "log-update";
import { blue, bold, brandColor, dim, gray } from "./colors";
import { cancel, newline, shapes, space, status } from "./index";
import type { ChalkInstance } from "chalk";

export type Arg = string | boolean | string[] | undefined;
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
	defaultValue?: string | boolean;
	// The status label to be shown after submitting
	label: string;
	// Pretty-prints the value in the interactive prompt
	format?: (value: Arg) => string;
	// Returns a user displayed error if the value is invalid
	validate?: (value: Arg) => string | void;
};

export type TextPromptConfig = BasePromptConfig & {
	type: "text";
};
export type SelectPromptConfig =
	| BasePromptConfig & {
			type: "select";
			options: Option[];
	  };
export type ConfirmPromptConfig =
	| BasePromptConfig & {
			type: "confirm";
			activeText?: string;
			inactiveText?: string;
	  };

export type PromptConfig =
	| TextPromptConfig
	| ConfirmPromptConfig
	| SelectPromptConfig;

type RenderProps =
	| Omit<SelectPrompt<Option>, "prompt">
	| Omit<TextPrompt, "prompt">
	| Omit<ConfirmPrompt, "prompt">;

export const inputPrompt = async (promptConfig: PromptConfig) => {
	const renderers = getRenderers(promptConfig);

	let prompt: SelectPrompt<Option> | TextPrompt | ConfirmPrompt;

	// Looks up the needed renderer by the current state ('initial', 'submitted', etc.)
	const dispatchRender = (props: RenderProps): string | void => {
		const renderedLines = renderers[props.state](props);
		return renderedLines.join("\n");
	};

	if (promptConfig.type === "select") {
		prompt = new SelectPrompt({
			...promptConfig,
			initialValue: String(promptConfig.defaultValue),
			render() {
				return dispatchRender(this);
			},
		});
	} else if (promptConfig.type === "confirm") {
		prompt = new ConfirmPrompt({
			...promptConfig,
			initialValue: Boolean(promptConfig.defaultValue),
			active: promptConfig.activeText || "",
			inactive: promptConfig.inactiveText || "",
			render() {
				return dispatchRender(this);
			},
		});
	} else {
		prompt = new TextPrompt({
			...promptConfig,
			defaultValue: String(promptConfig.defaultValue),
			render() {
				return dispatchRender(this);
			},
		});
	}

	const input = (await prompt.prompt()) as string;

	return input;
};

type Renderer = (props: {
	state?: string;
	error?: string;
	cursor?: number;
	value: Arg;
}) => string[];

const renderSubmit = (config: PromptConfig, value: string) => {
	const { question, label } = config;

	const content =
		config.type === "confirm"
			? `${grayBar} ${brandColor(value)} ${dim(label)}`
			: `${grayBar} ${brandColor(label)} ${dim(value)}`;

	return [`${leftT} ${question}`, content, `${grayBar}`];
};

const handleCancel = () => {
	// Restore the cursor hidden by the select and confirm dialogs
	process.stdout.write(ansiEscapes.cursorShow);
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
			`${space(2)}${format(value || dim(defaultValue))}`,
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

const getSelectRenderers = (config: SelectPromptConfig) => {
	const { options, question, helpText: _helpText } = config;
	const helpText = _helpText ?? "";

	const defaultRenderer: Renderer = ({ cursor }) => {
		const renderOption = (opt: Option, i: number) => {
			const { label: optionLabel } = opt;
			const active = i === cursor;
			const text = active ? blue.underline(optionLabel) : dim(optionLabel);
			const indicator = active
				? blue(shapes.radioActive)
				: dim(shapes.radioInactive);

			return `${space(2)}${indicator} ${text}`;
		};

		return [
			`${blCorner} ${bold(question)} ${dim(helpText)}`,
			`${options
				.filter((o) => !o.hidden)
				.map(renderOption)
				.join(`\n`)}`,
			``, // extra line for readability
		];
	};

	return {
		initial: defaultRenderer,
		active: defaultRenderer,
		confirm: defaultRenderer,
		error: defaultRenderer,
		submit: ({ value }: { value: Arg }) =>
			renderSubmit(
				config,
				options.find((o) => o.value === value)?.label as string
			),
		cancel: handleCancel,
	};
};

const getConfirmRenderers = (config: ConfirmPromptConfig) => {
	const { activeText, inactiveText, question, helpText: _helpText } = config;
	const helpText = _helpText ?? "";

	const active = activeText || "Yes";
	const inactive = inactiveText || "No";

	const defaultRenderer: Renderer = ({ value }) => {
		const yesColor = value ? blue : dim;
		const noColor = value ? dim : blue;
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
	color: ChalkInstance = brandColor
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
