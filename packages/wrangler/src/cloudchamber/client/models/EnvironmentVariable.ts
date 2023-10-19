/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { EnvironmentVariableName } from "./EnvironmentVariableName";
import type { EnvironmentVariableValue } from "./EnvironmentVariableValue";

/**
 * An environment variable with a value set
 */
export type EnvironmentVariable = {
	name: EnvironmentVariableName;
	value: EnvironmentVariableValue;
};
