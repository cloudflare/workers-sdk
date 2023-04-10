import { isOptionalProperty, isRequiredProperty, notInheritable, validateBindingsProperty } from "../config/validation-helpers";
import type { RawConfig, RawEnvironment } from "../config";
import type { Diagnostics } from "../config/diagnostics";
import type { ValidatorFn } from "../config/validation-helpers";
import type { Environment } from "./../config/environment";

// ===== Format read from config =====

// Internal details

export type DurableObjectFromConfig = {
	/** The name of the binding used to refer to the Durable Object */
	name: string;
	/** The exported class name of the Durable Object */
	class_name: string;
	/** The script where the Durable Object is defined (if it's external to this worker) */
	script_name?: string;
	/** The service environment of the script_name to bind to */
	environment?: string;
}[];

// Type added to Environment

export interface BindingTypeDurableObject {
	/**
	 * A list of durable objects that your worker should be bound to.
	 *
	 * For more information about Durable Objects, see the documentation at
	 * https://developers.cloudflare.com/workers/learning/using-durable-objects
	 *
	 * NOTE: This field is not automatically inherited from the top level environment,
	 * and so must be specified in every named environment.
	 *
	 * @default `{bindings:[]}`
	 * @nonInheritable
	 */
	durable_objects: {
		bindings: DurableObjectFromConfig;
	};
}

// ===== Format written to upload form ====

export interface CfDurableObject {
	name: string;
	class_name: string;
	script_name?: string;
	environment?: string;
}

export function get_durable_object(
	diagnostics: Diagnostics,
	topLevelEnv: Environment | undefined,
	rawConfig: RawConfig | undefined,
	rawEnv: RawEnvironment,
	envName: string,
) {
  return notInheritable(
    diagnostics,
    topLevelEnv,
    rawConfig,
    rawEnv,
    envName,
    "durable_objects",
    validateBindingsProperty(envName, validateDurableObjectBinding),
    {
      bindings: [],
    }
  )
}

// ===== Validation function =====

/**
 * Check that the given field is a valid "durable_object" binding object.
 */
const validateDurableObjectBinding: ValidatorFn = (
	diagnostics,
	field,
	value
) => {
	if (typeof value !== "object" || value === null) {
		diagnostics.errors.push(
			`Expected "${field}" to be an object but got ${JSON.stringify(value)}`
		);
		return false;
	}

	// Durable Object bindings must have a name and class_name, and optionally a script_name and an environment.
	let isValid = true;
	if (!isRequiredProperty(value, "name", "string")) {
		diagnostics.errors.push(`binding should have a string "name" field.`);
		isValid = false;
	}
	if (!isRequiredProperty(value, "class_name", "string")) {
		diagnostics.errors.push(`binding should have a string "class_name" field.`);
		isValid = false;
	}
	if (!isOptionalProperty(value, "script_name", "string")) {
		diagnostics.errors.push(
			`the field "script_name", when present, should be a string.`
		);
		isValid = false;
	}
	// environment requires a script_name
	if (!isOptionalProperty(value, "environment", "string")) {
		diagnostics.errors.push(
			`the field "environment", when present, should be a string.`
		);
		isValid = false;
	}

	if ("environment" in value && !("script_name" in value)) {
		diagnostics.errors.push(
			`binding should have a "script_name" field if "environment" is present.`
		);
		isValid = false;
	}

	return isValid;
};