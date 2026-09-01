/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SSHPublicKey } from "./SSHPublicKey";

/**
 * SSH public key provided by the user
 */
export type UserSSHPublicKey = {
	name?: string;
	public_key: SSHPublicKey;
};
