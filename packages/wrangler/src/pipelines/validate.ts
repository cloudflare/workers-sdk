import { UserError } from "../errors";

export function validateName(label: string, name: string) {
	if (!name.match(/^[a-zA-Z0-9-]+$/)) {
		throw new UserError(`Must provide a valid ${label}`);
	}
}

export function validateCorsOrigins(values: string[] | undefined) {
	if (!values || !values.length) {
		return values;
	}

	// If wildcard provided, ignore other options
	if (values.includes("*")) {
		if (values.length > 1) {
			throw new UserError("When specifying '*', only one value is permitted.");
		}
		return values;
	}

	// Ensure any value matches the format for a CORS origin
	for (const value of values) {
		if (!value.match(/^https?:\/\/[^/]+$/i)) {
			throw new UserError(
				`Provided value ${value} is not a valid CORS origin.`
			);
		}
	}
	return values;
}

export function validateInRange(name: string, min: number, max: number) {
	return (val: number) => {
		if (val < min || val > max) {
			throw new UserError(`${name} must be between ${min} and ${max}`);
		}
		return val;
	};
}
