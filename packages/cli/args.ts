import { getRenderers, inputPrompt } from "./interactive";
import { crash, logRaw } from ".";
import type { Arg, PromptConfig } from "./interactive";

export const processArgument = async <T>(
	args: Record<string, Arg>,
	name: string,
	promptConfig: PromptConfig
) => {
	if (process.env.VITEST && "defaultValue" in promptConfig) {
		console.log("====> RETURNING DEFAULT VALUE");
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return promptConfig.defaultValue as any;
	}

	let value = args[name];
	const renderSubmitted = getRenderers(promptConfig).submit;

	// If the value has already been set via args, use that
	if (value !== undefined) {
		const error = promptConfig.validate?.(value);
		if (error) {
			crash(error);
		}

		const lines = renderSubmitted({ value });
		logRaw(lines.join("\n"));

		return value as T;
	}

	value = await inputPrompt(promptConfig);

	return value as T;
};
