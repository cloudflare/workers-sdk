/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { PlainTextSecretValue } from "./PlainTextSecretValue";
import type { SecretAccessType } from "./SecretAccessType";
import type { SecretName } from "./SecretName";

/**
 * A job secret map contains a secret name, the plain-text secret itself and the type which denotes how it is made available within a container. This is used in an application job when creating jobs. Their lifetime is the same as the job itself, unlike an account level secret.
 */
export type JobSecretMap = {
	name: SecretName;
	value: PlainTextSecretValue;
	type: SecretAccessType;
};
