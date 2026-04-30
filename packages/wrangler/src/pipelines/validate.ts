import { CommandLineArgsError, UserError } from "@cloudflare/workers-utils";

/**
 * Validate entity name is used for Pipelines V1 API entities such as sources, sinks and pipelines.
 * @param label the name of the entity to validate
 * @param name the user provided name
 */
export function validateEntityName(label: string, name: string) {
	if (!name.match(/^[a-zA-Z0-9_]+$/)) {
		throw new CommandLineArgsError(
			`${label} name must contain only letters, numbers, and underscores`,
			{ telemetryMessage: "pipelines validation invalid entity name" }
		);
	}
}

/**
 * Validate name is used for legacy Pipelines. This validation should not be used for Pipelines V1 entities.
 * @param label the name of the entity to validate
 * @param name the user provided name
 * @deprecated use validateEntityName instead
 */
export function validateName(label: string, name: string) {
	if (!name.match(/^[a-zA-Z0-9-]+$/)) {
		throw new UserError(`Must provide a valid ${label}`, {
			telemetryMessage: "pipelines validation invalid name",
		});
	}
}

export function validateCorsOrigins(values: string[] | undefined) {
	if (!values || !values.length) {
		return values;
	}

	// If none provided, ignore other options
	if (values.includes("none")) {
		if (values.length > 1) {
			throw new UserError(
				"When specifying 'none', only one value is permitted.",
				{ telemetryMessage: "pipelines validation invalid cors none" }
			);
		}
		return [];
	}

	// If wildcard provided, ignore other options
	if (values.includes("*")) {
		if (values.length > 1) {
			throw new UserError("When specifying '*', only one value is permitted.", {
				telemetryMessage: "pipelines validation invalid cors wildcard",
			});
		}
		return values; // ["*"]
	}

	// Ensure any value matches the format for a CORS origin
	for (const value of values) {
		if (!value.match(/^https?:\/\/[^/]+$/i)) {
			throw new UserError(
				`Provided value ${value} is not a valid CORS origin.`,
				{ telemetryMessage: "pipelines validation invalid cors origin" }
			);
		}
	}
	return values;
}

export function validateInRange(name: string, min: number, max: number) {
	return (val: number) => {
		if (val < min || val > max) {
			throw new UserError(`${name} must be between ${min} and ${max}`, {
				telemetryMessage: "pipelines validation value out of range",
			});
		}
		return val;
	};
}
