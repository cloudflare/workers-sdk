import { error, log, warn } from "@cloudflare/cli-shared-helpers";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { execaCommand } from "execa";
import type { AutoConfigContext } from "@cloudflare/autoconfig";

/**
 * Joins the variadic arguments passed to a logger method into a single
 * space-separated string, matching the behaviour of `console.log`.
 *
 * @param args - The arguments passed to the logger method.
 * @returns A single string with each argument stringified and space-separated.
 */
function stringifyLogArgs(args: unknown[]): string {
	return args
		.map((arg) => (typeof arg === "string" ? arg : String(arg)))
		.join(" ");
}

/**
 * Creates an `AutoConfigContext` that wires C3's logging, prompting, and command
 * execution infrastructure into the generic `@cloudflare/autoconfig` system.
 *
 * @returns A fully-configured `AutoConfigContext` for use with `@cloudflare/autoconfig`.
 */
export function createC3AutoConfigContext(): AutoConfigContext {
	return {
		logger: {
			log: (...args) => log(stringifyLogArgs(args)),
			info: (...args) => log(stringifyLogArgs(args)),
			warn: (...args) => warn(stringifyLogArgs(args)),
			error: (...args) => error(stringifyLogArgs(args)),
			// C3 has no dedicated debug channel; debug output is suppressed to keep
			// the scaffolding output clean.
			debug: () => {},
		},
		dialogs: {
			confirm: async (text, options) => {
				const nonInteractive = isNonInteractiveOrCI();
				const defaultValue = nonInteractive
					? (options?.fallbackValue ?? options?.defaultValue ?? false)
					: (options?.defaultValue ?? true);

				return inputPrompt<boolean>({
					type: "confirm",
					question: text,
					label: "",
					defaultValue,
					acceptDefault: nonInteractive,
				});
			},
			prompt: async (text, options) => {
				return inputPrompt<string>({
					type: "text",
					question: text,
					label: "",
					defaultValue: options?.defaultValue,
					acceptDefault: isNonInteractiveOrCI(),
					validate: options?.validate
						? (value) => {
								const result = options.validate?.(value as string);
								// C3 only ever runs autoconfig with confirmations skipped, so the
								// interactive (and possibly async) validation path is never hit.
								// Treat anything we can't synchronously resolve as valid.
								if (result instanceof Promise) {
									return undefined;
								}
								if (result === true || result === undefined) {
									return undefined;
								}
								return result === false ? "Invalid value" : result;
							}
						: undefined,
				});
			},
			select: async (text, options) => {
				return inputPrompt<string>({
					type: "select",
					question: text,
					label: "",
					options: options.choices.map((choice) => ({
						label: choice.title,
						value: choice.value,
					})),
					defaultValue: options.choices[options.defaultOption ?? 0]?.value,
					acceptDefault: isNonInteractiveOrCI(),
				});
			},
		},
		runCommand: async (command, cwd, label) => {
			log(`${label} Running: ${command}`);
			await execaCommand(command, { shell: true, cwd, stdio: "inherit" });
		},
		isNonInteractiveOrCI,
	};
}
