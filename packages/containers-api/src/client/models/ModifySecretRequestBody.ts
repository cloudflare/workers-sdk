/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { PlainTextSecretValue } from "./PlainTextSecretValue";

/**
 * Request body for modifying an existing secret
 */
export type ModifySecretRequestBody = {
	value: PlainTextSecretValue;
};
