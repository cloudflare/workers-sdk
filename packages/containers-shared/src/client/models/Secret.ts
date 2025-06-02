/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { PlainTextSecretValue } from "./PlainTextSecretValue";

/**
 * An object representing a secret with a name and value. Used when a user creates a new secret.
 */
export type Secret = {
	name: string;
	value: PlainTextSecretValue;
};
