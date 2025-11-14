/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Credentials needed to authenticate with an external image registry.
 */
export type ImageRegistryAuth = {
	/** The format of this value is determined by the registry being configured. */
	public_credential: string;
	/**
	 * Either a reference to a secret in secret store, or the secret itself,
	 * which is used when secret-store is not available, e.g. in FedRAMP
	 */
	private_credential:
		| {
				store_id: string;
				secret_name: string;
		  }
		| string;
};
