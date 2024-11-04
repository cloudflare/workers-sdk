/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SecretAccessType } from "./SecretAccessType";

/**
 * Specifies how secrets are accessed in containers, defining the name of the secret within the container and the corresponding account secret name.
 */
export type DeploymentSecretMap = {
	/**
	 * The name of the secret within the container
	 */
	name: string;
	type: SecretAccessType;
	/**
	 * Corresponding secret name from the account
	 */
	secret: string;
};
