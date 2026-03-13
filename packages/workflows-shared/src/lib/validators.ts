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
