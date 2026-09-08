/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SecretAccessType } from "./SecretAccessType";
import type { SecretName } from "./SecretName";

/**
 * A secret map contains a secret name and the type which denotes how it is made available within a jobs container
 */
export type SecretMap = {
	name: SecretName;
	type: SecretAccessType;
};
