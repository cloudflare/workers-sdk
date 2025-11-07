import type { Arg, PromptConfig } from "./interactive";

import { inputPrompt } from "./interactive";

export const processArgument = async <T>(
	args: Record<string, Arg>,
	name: string,
	promptConfig: PromptConfig
) => {
	const value = args[name];
	const result = await inputPrompt<T>({
		...promptConfig,
		// Accept the default value if the arg is already set
		acceptDefault: promptConfig.acceptDefault ?? value !== undefined,
		defaultValue: value ?? promptConfig.defaultValue,
	});

	// Update value in args before returning the result
	args[name] = result as Arg;

	return result;
};
