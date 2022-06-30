import { isString } from "../../config/validation-helpers";
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

export const isValidEnvName = (envName: string): boolean => {
	return /^[a-zA-Z_-]{1,64}$/.test(envName);
}

export const isValidEnvValue = (envValue: string): boolean => {
	return envValue.length < 128 && !envValue.startsWith('=') && !envValue.endsWith('=');
}

export const validateVars: ValidatorFn = (diagnostics, field, value) => {
	let isValid = true;
	if (typeof value !== 'object' && value !== undefined) {
		diagnostics.errors.push(`The field "${field}" should be an object but got ${JSON.stringify(
			value
		)}.\n`);
		isValid = false;
	} else if (typeof value === 'object') {
		const configEntries = Object.entries(value ?? {});
		// If there are no top level vars then there is nothing to do here.
		if (configEntries.length > 0) {
			for (const [key, envValue] of configEntries) {
				if (!isValidEnvName(key)) {
					diagnostics.errors.push(`Invalid environment variable name: ${key}`);
				}
				isString(diagnostics, `${key}.value`, envValue, undefined);
				if (!isValidEnvValue(envValue)) {
					diagnostics.errors.push(`Invalid environment variable value for "${key}": ${envValue}`);
				}
			}
		}
	}
	return isValid;
};