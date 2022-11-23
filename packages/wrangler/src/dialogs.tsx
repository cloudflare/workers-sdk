import assert from "assert";
import chalk from "chalk";
import prompts from "prompts";
import { CI } from "./is-ci";
import isInteractive from "./is-interactive";
import { logger } from "./logger";

// TODO: Use this function across the codebase.
function isNonInteractiveOrCI(): boolean {
	return !isInteractive() || CI.isCI();
}

export async function confirm(
	text: string,
	defaultValue = true
): Promise<boolean> {
	if (isNonInteractiveOrCI()) return defaultValue;
	const { value } = await prompts({
		type: "confirm",
		name: "value",
		message: text,
		initial: defaultValue,
	});
	return value;
}
interface PromptOptions {
	defaultValue?: string;
	isSecret?: boolean;
}

export async function prompt(
	text: string,
	options: PromptOptions = {}
): Promise<string> {
	if (isNonInteractiveOrCI()) {
		assert(
			options?.defaultValue !== undefined,
			"A default value must be provided in non-interactive contexts"
		);
		return options.defaultValue;
	}
	const { value } = await prompts({
		type: "text",
		name: "value",
		message: text,
		initial: options?.defaultValue,
		style: options?.isSecret ? "password" : "default",
	});
	return value;
}

interface SelectOption {
	title: string;
	description?: string;
	value: string;
}
export async function select(
	text: string,
	choices: SelectOption[],
	defaultOption?: number
): Promise<string> {
	if (isNonInteractiveOrCI()) {
		assert(
			defaultOption !== undefined,
			"A default value must be provided in non-interactive contexts"
		);
		return choices[defaultOption].value;
	}

	const { value } = await prompts({
		type: "select",
		name: "value",
		message: text,
		choices,
		initial: defaultOption,
	});
	return value;
}

export function logDim(msg: string) {
	console.log(chalk.gray(msg));
}

export async function fromDashMessagePrompt(
	deploySource: "dash" | "wrangler" | "api"
): Promise<boolean | void> {
	if (deploySource === "dash") {
		logger.warn(
			`You are about to publish a Workers Service that was last published via the Cloudflare Dashboard.\nEdits that have been made via the dashboard will be overridden by your local code and config.`
		);
		return confirm("Would you like to continue?");
	}
}
export async function tailDOLogPrompt(): Promise<boolean | void> {
	return confirm("Would you like to continue?");
}
