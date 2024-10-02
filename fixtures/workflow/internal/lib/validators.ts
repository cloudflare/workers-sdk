export const MAX_STEP_NAME_LENGTH = 256;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = new RegExp('[\x00-\x1F]');

export function validateStepName(string: string): boolean {
	if (string.length > MAX_STEP_NAME_LENGTH) {
		return false;
	}

	//check for control chars
	return !CONTROL_CHAR_REGEX.test(string);
}
