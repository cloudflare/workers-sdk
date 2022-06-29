import type { ValidatorFn } from "../../config/validation-helpers";

/**
 * Validate that the `name` field is compliant with EWC constraints.
 */
export const isValidName: ValidatorFn = (diagnostics, field, value) => {
	if (
		(typeof value === "string" && /^$|^[a-z0-9_ ][a-z0-9-_ ]*$/.test(value)) ||
		value === undefined
	) {
		return true;
	} else {
		diagnostics.errors.push(
			`Expected "${field}" to be of type string, alphanumeric and lowercase with dashes only but got ${JSON.stringify(
				value
			)}.`
		);
		return false;
	}
};
