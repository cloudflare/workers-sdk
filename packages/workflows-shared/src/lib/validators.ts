export const MAX_STEP_NAME_LENGTH = 256;
export const MAX_WORKFLOW_ID_LENGTH = 64;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = new RegExp("[\x00-\x1F]");

export function validateStepName(string: string): boolean {
	if (string.length > MAX_STEP_NAME_LENGTH) {
		return false;
	}

	//check for control chars
	return !CONTROL_CHAR_REGEX.test(string);
}

export function validateWorkflowId(id: string): boolean {
	if (id.length > MAX_WORKFLOW_ID_LENGTH) {
		return false;
	}

	//check for control chars
	return !CONTROL_CHAR_REGEX.test(id);
}
