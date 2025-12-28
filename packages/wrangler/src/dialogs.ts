import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import Fuse from "fuse.js";
import prompts from "prompts";
import { isNonInteractiveOrCI } from "./is-interactive";
import { logger } from "./logger";

export class NoDefaultValueProvided extends UserError {
	constructor() {
		// This is user-facing, so make the message something understandable
		// It _should_ always be caught and replaced with a more descriptive error
		// but this is fine as a fallback.
		super("This command cannot be run in a non-interactive context", {
			telemetryMessage: true,
		});
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

interface ConfirmOptions {
	defaultValue?: boolean;
	fallbackValue?: boolean;
}

export async function confirm(
	text: string,
	{ defaultValue = true, fallbackValue = true }: ConfirmOptions = {}
): Promise<boolean> {
	if (isNonInteractiveOrCI()) {
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using fallback value in non-interactive context:"
			)} ${chalk.white.bold(fallbackValue ? "yes" : "no")}`
		);
		return fallbackValue;
	}
	const { value } = await prompts({
		type: "confirm",
		name: "value",
		message: text,
		initial: defaultValue,
		onState: (state) => {
			if (state.aborted) {
				process.nextTick(() => {
					process.exit(1);
				});
			}
		},
	});
	return value;
}

interface PromptOptions {
	defaultValue?: string;
	isSecret?: boolean;
	validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

export async function prompt(
	text: string,
	options: PromptOptions = {}
): Promise<string> {
	if (isNonInteractiveOrCI()) {
		if (options?.defaultValue === undefined) {
			throw new NoDefaultValueProvided();
		}
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using default value in non-interactive context:"
			)} ${chalk.white.bold(options.defaultValue)}`
		);
		return options.defaultValue;
	}
	const { value } = await prompts({
		type: "text",
		name: "value",
		message: text,
		initial: options?.defaultValue,
		style: options?.isSecret ? "password" : "default",
		validate: options.validate,
		onState: (state) => {
			if (state.aborted) {
				process.nextTick(() => {
					process.exit(1);
				});
			}
		},
	});
	return value;
}

interface SelectOptions<Values> {
	choices: SelectOption<Values>[];
	defaultOption?: number;
	fallbackOption?: number;
}

interface SelectOption<Values> {
	title: string;
	description?: string;
	value: Values;
}

export async function select<Values extends string>(
	text: string,
	options: SelectOptions<Values>
): Promise<Values> {
	if (isNonInteractiveOrCI()) {
		if (options.fallbackOption === undefined) {
			throw new NoDefaultValueProvided();
		}
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using fallback value in non-interactive context:"
			)} ${chalk.white.bold(options.choices[options.fallbackOption].title)}`
		);
		return options.choices[options.fallbackOption].value;
	}

	const { value } = await prompts({
		type: "select",
		name: "value",
		message: text,
		choices: options.choices,
		initial: options.defaultOption,
		onState: (state) => {
			if (state.aborted) {
				process.nextTick(() => {
					process.exit(1);
				});
			}
		},
	});
	return value;
}

/**
 * An interactive select prompt with fuzzy search/filtering.
 * Users can type to filter the list of options using fuzzy matching.
 * Use this for selects where the list of options may be long (e.g., accounts, projects).
 */
export async function autoCompleteSelect<Values extends string>(
	text: string,
	options: SelectOptions<Values>
): Promise<Values> {
	if (isNonInteractiveOrCI()) {
		if (options.fallbackOption === undefined) {
			throw new NoDefaultValueProvided();
		}
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using fallback value in non-interactive context:"
			)} ${chalk.white.bold(options.choices[options.fallbackOption].title)}`
		);
		return options.choices[options.fallbackOption].value;
	}

	// Fuse.js threshold of 0.4 provides a balance between tolerating typos
	// and avoiding false matches. Lower values are stricter (0 = exact match),
	// higher values are more lenient (1 = match anything).
	// This can be tuned based on user feedback.
	const fuse = new Fuse(options.choices, {
		keys: ["title"],
		threshold: 0.4,
	});

	const suggest = (
		input: string,
		choices: prompts.Choice[]
	): Promise<prompts.Choice[]> => {
		if (!input) {
			return Promise.resolve(choices);
		}
		const results = fuse.search(input);
		return Promise.resolve(results.map((result) => result.item));
	};

	const { value } = await prompts({
		type: "autocomplete",
		name: "value",
		message: text,
		choices: options.choices,
		initial: options.defaultOption,
		limit: 10,
		hint: "Start typing to filter",
		suggest,
		onState: (state) => {
			if (state.aborted) {
				process.nextTick(() => {
					process.exit(1);
				});
			}
		},
	});
	return value;
}

interface MultiSelectOptions<Values> {
	choices: SelectOption<Values>[];
	defaultOptions?: number[];
}

export async function multiselect<Values extends string>(
	text: string,
	options: MultiSelectOptions<Values>
): Promise<Values[]> {
	if (isNonInteractiveOrCI()) {
		if (options?.defaultOptions === undefined) {
			throw new NoDefaultValueProvided();
		}

		const defaultTitles = options.defaultOptions.map(
			(index) => options.choices[index].title
		);
		logger.log(`? ${text}`);

		logger.log(
			`🤖 ${chalk.dim(
				"Using default value(s) in non-interactive context:"
			)} ${chalk.white.bold(defaultTitles.join(", "))}`
		);
		return options.defaultOptions.map((index) => options.choices[index].value);
	}
	const { value } = await prompts({
		type: "multiselect",
		name: "value",
		message: text,
		choices: options.choices,
		instructions: false,
		hint: "- Space to select. Return to submit",
		onState: (state) => {
			if (state.aborted) {
				process.nextTick(() => {
					process.exit(1);
				});
			}
		},
	});
	return value;
}
