/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * A reference to a secret stored in Secrets Store
 */
export type SecretsStoreRef = {
	/**
	 * Store ID where the secret is stored
	 */
	store_id: string;
	/**
	 * Name of the secret being referenced
	 */
	secret_name: string;
};
