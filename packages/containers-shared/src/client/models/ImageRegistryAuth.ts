/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * A JSON string that encodes the auth required to authenticate with an external image registry. The format of the JSON object is determined by the registry being configured.
 */
export type ImageRegistryAuth = {
	public_credential: string;
	private_credential: {
		store_id: string;
		secret_name: string;
	};
};
