/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SSHPublicKey } from "./SSHPublicKey";

/**
 * Request body for adding a new SSH public key
 */
export type CreateSSHPublicKeyRequestBody = {
	name: string;
	public_key: SSHPublicKey;
};
