/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SecretsStoreRef } from "./SecretsStoreRef";

/**
 * Credentials needed to authenticate with an external image registry.
 */
export type ImageRegistryAuth = {
	/**
	 * The format of this value is determined by the registry being configured.
	 */
	public_credential: string;
	private_credential: string | SecretsStoreRef;
};
