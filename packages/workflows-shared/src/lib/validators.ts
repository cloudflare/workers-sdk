import { ms } from "itty-time";
import { z } from "zod";

export const MAX_INSTANCE_STEPS = 1024;

export const MAX_WORKFLOW_NAME_LENGTH = 64;

export const MAX_WORKFLOW_INSTANCE_ID_LENGTH = 100;

export const MAX_STEP_NAME_LENGTH = 256;

export const ALLOWED_STRING_ID_PATTERN = "^[a-zA-Z0-9_][a-zA-Z0-9-_]*$";
const ALLOWED_WORKFLOW_INSTANCE_ID_REGEX = new RegExp(
	ALLOWED_STRING_ID_PATTERN
);
const ALLOWED_WORKFLOW_NAME_REGEX = ALLOWED_WORKFLOW_INSTANCE_ID_REGEX;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = new RegExp("[\x00-\x1F]");

export function isValidWorkflowName(name: string): boolean {
	if (typeof name !== "string") {
		return false;
	}
	if (name.length > MAX_WORKFLOW_NAME_LENGTH) {
		return false;
	}

	return ALLOWED_WORKFLOW_NAME_REGEX.test(name);
}

export function isValidWorkflowInstanceId(id: string): boolean {
	if (typeof id !== "string") {
		return false;
	}

	if (id.length > MAX_WORKFLOW_INSTANCE_ID_LENGTH) {
		return false;
	}

	return ALLOWED_WORKFLOW_INSTANCE_ID_REGEX.test(id);
}

export function isValidStepName(name: string): boolean {
	if (name.length > MAX_STEP_NAME_LENGTH) {
		return false;
	}

	return !CONTROL_CHAR_REGEX.test(name);
}

const STEP_CONFIG_SCHEMA = z
	.object({
		retries: z
			.object({
				// NOTE(lduarte): delay of 0 is dubvious but i'm afraid of breaking changes
				delay: z.number().gte(0).or(z.string()),
				limit: z.number().gte(0),
				backoff: z.enum(["constant", "linear", "exponential"]).optional(),
			})
			.strict()
			.optional(),
		timeout: z.number().gte(0).or(z.string()).optional(),
	})
	.strict();

export function isValidStepConfig(stepConfig: unknown): boolean {
	const config = STEP_CONFIG_SCHEMA.safeParse(stepConfig);

	if (!config.success) {
		return false;
	}

	if (
		config.data.retries !== undefined &&
		Number.isNaN(ms(config.data.retries.delay))
	) {
		return false;
	}

	if (config.data.timeout !== undefined) {
		const timeout = config.data.timeout;
		if (timeout == 0 || Number.isNaN(ms(config.data.timeout))) {
			return false;
		}
	}

	return true;
}
