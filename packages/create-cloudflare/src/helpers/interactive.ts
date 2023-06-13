import { TextPrompt, SelectPrompt, ConfirmPrompt } from "@clack/core";
import { isCancel } from "@clack/prompts";
import logUpdate from "log-update";
import { shapes, cancel, space, status, newline, logRaw } from "./cli";
import { blue, dim, gray, brandColor, bold } from "./colors";

const grayBar = gray(shapes.bar);
const blCorner = gray(shapes.corners.bl);
const leftT = gray(shapes.leftT);

export type TextOptions = {
	renderSubmitted: (value: string) => string;
	question: string;
	defaultValue: string;
	acceptDefault: boolean | undefined; // must be specified, but can be undefined (≈ false)
	helpText?: string;
	format?: (value: string) => string;
	validate?: (value: string) => string | void;
};

export const textInput = async (opts: TextOptions) => {
	const { renderSubmitted, question, defaultValue, validate, acceptDefault } =
		opts;
	const helpText = opts.helpText || ``;
	const format = opts.format || ((val: string) => val);

	const prompt = new TextPrompt({
		defaultValue: defaultValue,
		validate,
		render() {
			let body = "";
			switch (this.state) {
				case "initial":
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${space(2)}${gray(format(defaultValue))}\n`;
					break;
				case "active":
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${space(2)}${format(this.value)}\n`;
					break;
				case "submit":
					body += `${leftT} ${question}\n`;
					body += `${grayBar} ${renderSubmitted(
						format(this.value)
					)}\n${grayBar}`;
					break;
				case "error":
					body += `${leftT} ${status.error} ${dim(this.error)}\n`;
					body += `${grayBar}\n`;
					body += `${blCorner} ${question} ${dim(helpText)}\n`;
					body += `${space(2)}${format(this.value)}\n`;
					break;
				default:
					break;
			}

			return body;
		},
	});

	let value: string;
	if (acceptDefault) {
		logRaw(`${leftT} ${question}`);
		logRaw(`${grayBar} ${renderSubmitted(defaultValue)}\n${grayBar}`);
		value = defaultValue;
		validate?.(value);
	} else {
		value = (await prompt.prompt()) as string;

		if (isCancel(value)) {
			cancel("Operation cancelled.");
			process.exit(0);
		}
	}

	return value;
};

export type Option = {
	label: string;
	value: string;
};

type SelectOptions = {
	question: string;
	renderSubmitted: (option: Option) => string;
	options: Option[];
	helpText?: string;
	defaultValue: string;
	acceptDefault: boolean | undefined; // must be specified, but can be undefined (≈ false)
};

export const selectInput = async (opts: SelectOptions) => {
	const { question, options, renderSubmitted, defaultValue, acceptDefault } =
		opts;
	const helpText = opts.helpText || ``;

	const prompt = new SelectPrompt({
		options,
		initialValue: defaultValue ?? options[0].value,
		render() {
			const renderOption = (opt: Option, i: number) => {
				const { label } = opt;
				const active = i === this.cursor;
				const text = active ? blue.underline(label) : dim(label);
				const indicator = active
					? blue(shapes.radioActive)
					: dim(shapes.radioInactive);

				return `${space(2)}${indicator} ${text}`;
			};

			let body = ``;

			switch (this.state) {
				case "submit":
					body += `${leftT} ${question}\n`;
					body += `${grayBar} ${renderSubmitted(options[this.cursor])}`;
					body += `\n${grayBar}`;
					break;
				default:
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${options.map(renderOption).join(`\n`)}\n`;
					break;
			}

			return body;
		},
	});

	let value: string;
	if (acceptDefault) {
		logRaw(`${leftT} ${question}`);
		logRaw(
			`${grayBar} ${renderSubmitted({
				label: defaultValue,
				value: defaultValue,
			})}`
		);
		logRaw(`${grayBar}`);
		value = defaultValue;
	} else {
		value = (await prompt.prompt()) as string;

		if (isCancel(value)) {
			cancel("Operation cancelled.");
			process.exit(0);
		}
	}

	return value as string;
};

type ConfirmOptions = {
	question: string;
	renderSubmitted: (value: boolean) => string;
	defaultValue?: boolean;
	acceptDefault: boolean | undefined; // must be specified, but can be undefined (≈ false)
	activeText?: string;
	inactiveText?: string;
	helpText?: string;
};

export const confirmInput = async (opts: ConfirmOptions) => {
	const {
		activeText,
		inactiveText,
		question,
		renderSubmitted,
		defaultValue = true,
		acceptDefault,
	} = opts;
	const helpText = opts.helpText || `(y/n)`;
	const active = activeText || "Yes";
	const inactive = inactiveText || "No";

	const prompt = new ConfirmPrompt({
		active,
		inactive,
		initialValue: defaultValue,
		render() {
			const yesColor = this.value ? blue : dim;
			const noColor = this.value ? dim : blue;

			let body = ``;
			switch (this.state) {
				case "submit":
					body += `${leftT} ${question}\n`;
					body += `${grayBar} ${renderSubmitted(this.value)}`;
					body += `\n${grayBar}`;
					break;
				default:
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${space(2)}${yesColor(active)} / ${noColor(inactive)}\n`;
					break;
			}

			return body;
		},
	});

	let value: boolean;

	if (acceptDefault) {
		logRaw(`${leftT} ${question}`);
		logRaw(`${grayBar} ${renderSubmitted(defaultValue)}`);
		logRaw(`${grayBar}`);
		value = defaultValue;
	} else {
		value = Boolean(await prompt.prompt());

		if (isCancel(value)) {
			cancel("Operation cancelled.");
			process.exit(0);
		}
	}

	return value;
};

export const spinner = () => {
	const spinnerFrames = ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"];
	const ellipsisFrames = ["", ".", "..", "...", " ..", "  .", ""];

	// Alternative animations we considered. Keeping around in case we
	// introduce different animations for different use cases.
	// const frames = ["▁", "▃", "▄", "▅", "▆", "▇", "▆", "▅", "▄", "▃"];
	// const frames = ["■", "□", "▪", "▫"];
	// const frames = ["✶", "✸", "✹", "✺", "✹", "✷"];
	// const frames = ["◜", "◠", "◝", "◞", "◡", "◟"];
	// const frames = ["◐", "◓", "◑", "◒"];
	// const frames = ["㊂", "㊀", "㊁"];

	const color = brandColor;
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

			let index = 0;

			clearLoop();
			loop = setInterval(() => {
				index++;
				const spinnerFrame = spinnerFrames[index % spinnerFrames.length];
				const ellipsisFrame = ellipsisFrames[index % ellipsisFrames.length];

				if (msg) {
					logUpdate(`${color(spinnerFrame)} ${currentMsg} ${ellipsisFrame}`);
				}
			}, frameRate);
		},
		update(msg: string) {
			currentMsg = msg;
		},
		stop(msg?: string) {
			// Write the final message and clear the loop
			logUpdate.clear();
			if (msg) {
				logUpdate(`${leftT} ${startMsg}\n${grayBar} ${msg}`);
				logUpdate.done();
				newline();
			}
			clearLoop();
		},
	};
};
