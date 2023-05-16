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
	helpText?: string;
	validate?: (value: string) => string | void;
	initialValue?: string;
};

export const textInput = async (opts: TextOptions) => {
	const { renderSubmitted, question, defaultValue, validate, initialValue } =
		opts;
	const helpText = opts.helpText || ``;

	const prompt = new TextPrompt({
		defaultValue: defaultValue,
		validate,
		render() {
			let body = "";
			switch (this.state) {
				case "initial":
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${space(2)}${gray(defaultValue)}\n`;
					break;
				case "active":
					body += `${blCorner} ${bold(question)} ${dim(helpText)}\n`;
					body += `${space(2)}${this.value}\n`;
					break;
				case "submit":
					body += `${leftT} ${question}\n`;
					body += `${grayBar} ${renderSubmitted(this.value)}\n${grayBar}`;
					break;
				case "error":
					body += `${leftT} ${status.error} ${dim(this.error)}\n`;
					body += `${grayBar}\n`;
					body += `${blCorner} ${question} ${dim(helpText)}\n`;
					body += `${space(2)}${this.value}\n`;
					break;
				default:
					break;
			}

			return body;
		},
	});

	let value: string;
	if (initialValue) {
		logRaw(`${leftT} ${question}`);
		logRaw(`${grayBar} ${renderSubmitted(initialValue)}\n${grayBar}`);
		value = initialValue;
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
	initialValue?: string;
};

export const selectInput = async (opts: SelectOptions) => {
	const { question, options, renderSubmitted, initialValue } = opts;
	const helpText = opts.helpText || ``;

	const prompt = new SelectPrompt({
		options,
		initialValue: options[0].value,
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
	if (initialValue) {
		logRaw(`${leftT} ${question}`);
		logRaw(
			`${grayBar} ${renderSubmitted({
				label: initialValue,
				value: initialValue,
			})}`
		);
		logRaw(`${grayBar}`);
		value = initialValue;
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
	activeText?: string;
	inactiveText?: string;
	helpText?: string;
	initialValue?: boolean;
};

export const confirmInput = async (opts: ConfirmOptions) => {
	const {
		activeText,
		inactiveText,
		question,
		renderSubmitted,
		defaultValue,
		initialValue,
	} = opts;
	const helpText = opts.helpText || `(y/n)`;

	const active = activeText || "Yes";
	const inactive = inactiveText || "No";

	const prompt = new ConfirmPrompt({
		active,
		inactive,
		initialValue: defaultValue || true,
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

	if (initialValue !== undefined) {
		logRaw(`${leftT} ${question}`);
		logRaw(`${grayBar} ${renderSubmitted(initialValue)}`);
		logRaw(`${grayBar}`);
		value = initialValue;
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
	const frames = ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"];

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
	const maxDots = 4;
	let loop: NodeJS.Timer;
	let startMsg: string;

	return {
		start: (msg: string, helpText?: string) => {
			helpText ||= ``;
			startMsg = `${msg} ${dim(helpText)}`;

			let index = 0;
			let dots = 1;

			loop = setInterval(() => {
				const frame = frames[(index = ++index % frames.length)];
				dots = ++dots % maxDots;
				logUpdate(`${color(frame)} ${msg} ${".".repeat(dots)}`);
			}, frameRate);
		},
		stop: (msg: string) => {
			// Write the final message and clear the loop
			logUpdate.clear();
			logUpdate(`${leftT} ${startMsg}\n${grayBar} ${msg}`);
			logUpdate.done();
			newline();

			clearTimeout(loop);
		},
	};
};
