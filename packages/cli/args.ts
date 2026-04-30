import { inputPrompt } from "./interactive";
import type { Arg, PromptConfig } from "./interactive";

/**
 * Merge a CLI-flag value into the prompt config under the right
 * per-type field name. clack's prompts use different keys for the
 * default value (`defaultValue` for text, `initialValue` for
 * select/confirm, `initialValues` for multiselect) and `processArgument`
 * needs to feed a type-agnostic CLI value into whichever one applies.
 */
export function seedDefault(config: PromptConfig, value: Arg): PromptConfig {
	if (value === undefined) {
		return config;
	}
	switch (config.type) {
		case "text":
			return { ...config, defaultValue: String(value) };
		case "confirm":
			return { ...config, initialValue: Boolean(value) };
		case "select":
			return { ...config, initialValue: String(value) };
		case "multiselect":
			return {
				...config,
				initialValues: Array.isArray(value) ? value : [String(value)],
			};
	}
}

export const processArgument = async <T>(
	args: Record<string, Arg>,
	name: string,
	promptConfig: PromptConfig
) => {
	const value = args[name];
	const result = await inputPrompt<T>({
		...seedDefault(promptConfig, value),
		// If the CLI flag was already supplied, short-circuit the prompt.
		acceptDefault: promptConfig.acceptDefault ?? value !== undefined,
	});

	args[name] = result as Arg;

	return result;
};
