import { configFileName } from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { TOP_LEVEL_ENV_NAME } from "../../type-generation/helpers";
import { CLIError } from "../cli-error";

/**
 * Options for constructing a {@link MissingBindingFieldError}.
 */
export interface MissingBindingFieldErrorOptions {
	/** The actual binding object for error context. */
	binding: unknown;
	/** The type of binding (e.g. `"kv_namespaces"`, `"d1_databases"`). */
	bindingType: string;
	/** The path to the config file. */
	configPath: string | undefined;
	/** The environment name where the invalid binding was found. */
	envName: string;
	/** The name of the missing field (e.g. `"binding"`, `"name"`). */
	fieldName: string;
	/** The index of the binding in the array (0-based), or omit for non-array bindings. */
	index?: number;
}

/**
 * Thrown when a binding in the Wrangler configuration is missing a required
 * field (e.g. a KV namespace without a `binding` property).
 */
export class MissingBindingFieldError extends CLIError {
	/**
	 * @param options - The binding metadata used to construct the error message.
	 */
	constructor(options: MissingBindingFieldErrorOptions) {
		const { binding, bindingType, configPath, envName, fieldName, index } =
			options;

		const isArrayBinding = index !== undefined;
		const bindingPath = isArrayBinding
			? `${bindingType}[${index}]`
			: bindingType;
		const isTopLevel = envName === TOP_LEVEL_ENV_NAME;
		const field = isTopLevel ? bindingPath : `env.${envName}.${bindingPath}`;
		const bindingError = `"${field}" bindings should have a string "${fieldName}" field but got ${JSON.stringify(binding)}.`;

		const configFile = configFileName(configPath);

		const humanMessage = isTopLevel
			? `Processing ${configFile} configuration:\n  - ${bindingError}`
			: `Processing ${configFile} configuration:\n  - "env.${envName}" environment configuration\n    - ${bindingError}`;

		const envContext = isTopLevel
			? "at the top level of the configuration"
			: `in the "env.${envName}" environment`;

		const aiMessage = dedent`
			Error: Missing Binding Field

			A "${bindingType}" binding ${envContext} is missing the required "${fieldName}" field. While processing "${configFile}", Wrangler found a binding entry that is missing its "${fieldName}" property. The invalid binding object is:

			  ${JSON.stringify(binding, null, 2)}

			To resolve this, add a "${fieldName}" field to the "${field}" binding in "${configFile}" (e.g. "${fieldName}": "MY_BINDING"). See https://developers.cloudflare.com/workers/runtime-apis/bindings/ for binding configuration reference.

			You may want to ask the human developer what the "${fieldName}" value should be for this ${bindingType} binding.
		`;

		super(humanMessage, aiMessage, {
			telemetryMessage: "type generation config missing binding field",
		});
	}
}
