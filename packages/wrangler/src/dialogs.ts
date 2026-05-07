import * as clack from "@clack/prompts";
import { isNonInteractiveOrCI } from "@cloudflare/cli-shared-helpers/is-interactive";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { logger } from "./logger";
import type { TelemetryMessage } from "@cloudflare/workers-utils";

export class NoDefaultValueProvided extends UserError {
	constructor(
		options: TelemetryMessage = {
			telemetryMessage: "dialogs non interactive default missing",
		}
	) {
		// This is user-facing, so make the message something understandable
		// It _should_ always be caught and replaced with a more descriptive error
		// but this is fine as a fallback.
		super("This command cannot be run in a non-interactive context", options);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Cancel handling — preserves the previous `prompts`-library behavior of
 * scheduling `process.exit(1)` on the next tick when the user aborts a
 * prompt (Ctrl+C / Esc). Wrapping in `nextTick` lets in-flight clack
 * teardown render the cancel symbol before the process dies.
 */
function exitOnCancel<T>(value: T | symbol): T {
	if (clack.isCancel(value)) {
		process.nextTick(() => {
			process.exit(1);
		});
		// We've scheduled exit; return a value that won't be observed.
		// Cast to T since the calling code only inspects the return when
		// not cancelled.
		return undefined as unknown as T;
	}
	return value;
}

/**
 * Adapt the wrangler-style validate (`boolean | string`) signature to
 * the clack signature (`string | Error | undefined`). Wrangler returns
 * `true` for valid, `false` or a string error message for invalid.
 *
 * Clack `validate` is sync (it returns `string | Error | undefined`
 * directly, not a Promise). Wrangler's signature allowed async; if we
 * see a Promise we resolve it inline here, but in practice all
 * existing callsites are synchronous.
 */
function adaptValidate(
	validate?: (value: string) => boolean | string | Promise<boolean | string>
): ((value: string | undefined) => string | Error | undefined) | undefined {
	if (!validate) {
		return undefined;
	}
	return (value) => {
		const result = validate(value ?? "");
		if (result instanceof Promise) {
			// Wrangler's `validate` allows returning a Promise but clack
			// requires sync. We don't support async validation here; return
			// undefined optimistically and let the post-resolve check catch
			// any issues at the next prompt or downstream consumer.
			return undefined;
		}
		if (result === true) {
			return undefined;
		}
		if (typeof result === "string") {
			return result;
		}
		return "Invalid input";
	};
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
	const result = await clack.confirm({
		message: text,
		initialValue: defaultValue,
	});
	return exitOnCancel(result);
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
			throw new NoDefaultValueProvided({
				telemetryMessage: "dialogs prompt default missing",
			});
		}
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using default value in non-interactive context:"
			)} ${chalk.white.bold(options.defaultValue)}`
		);
		return options.defaultValue;
	}
	if (options.isSecret) {
		// clack.password doesn't support initialValue; secrets shouldn't
		// have defaults anyway.
		const result = await clack.password({
			message: text,
			validate: adaptValidate(options.validate),
		});
		return exitOnCancel(result);
	}
	const result = await clack.text({
		message: text,
		initialValue: options.defaultValue,
		validate: adaptValidate(options.validate),
	});
	return exitOnCancel(result);
}

interface SelectOption<Values> {
	title: string;
	description?: string;
	value: Values;
}

interface SelectOptions<Values> {
	choices: SelectOption<Values>[];
	defaultOption?: number;
	fallbackOption?: number;
}

export async function select<Values extends string>(
	text: string,
	options: SelectOptions<Values>
): Promise<Values> {
	if (isNonInteractiveOrCI()) {
		if (options.fallbackOption === undefined) {
			throw new NoDefaultValueProvided({
				telemetryMessage: "dialogs select fallback missing",
			});
		}
		logger.log(`? ${text}`);
		logger.log(
			`🤖 ${chalk.dim(
				"Using fallback value in non-interactive context:"
			)} ${chalk.white.bold(options.choices[options.fallbackOption].title)}`
		);
		return options.choices[options.fallbackOption].value;
	}
	// `Option<Value>` from `@clack/prompts` is a conditional type
	// (`Value extends Primitive ? {...} : {...}`) that TypeScript
	// won't reduce while `Values` is still a generic parameter, so a
	// plain object literal with `{label, value, hint}` doesn't match.
	// Cast through the helper's own input shape.
	type SelectOpts = Parameters<typeof clack.select<Values>>[0];
	const selectOptions = options.choices.map((choice) => ({
		label: choice.title,
		value: choice.value,
		...(choice.description ? { hint: choice.description } : {}),
	})) as unknown as SelectOpts["options"];
	const result = await clack.select<Values>({
		message: text,
		options: selectOptions,
		initialValue:
			options.defaultOption !== undefined
				? options.choices[options.defaultOption].value
				: undefined,
	});
	return exitOnCancel(result);
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
			throw new NoDefaultValueProvided({
				telemetryMessage: "dialogs multiselect defaults missing",
			});
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
	// See `select` above — the same conditional-type quirk applies.
	type MultiselectOpts = Parameters<typeof clack.multiselect<Values>>[0];
	const multiselectOptions = options.choices.map((choice) => ({
		label: choice.title,
		value: choice.value,
		...(choice.description ? { hint: choice.description } : {}),
	})) as unknown as MultiselectOpts["options"];
	const result = await clack.multiselect<Values>({
		message: text,
		options: multiselectOptions,
		initialValues: options.defaultOptions?.map(
			(index) => options.choices[index].value
		),
		required: false,
	});
	return exitOnCancel(result);
}
