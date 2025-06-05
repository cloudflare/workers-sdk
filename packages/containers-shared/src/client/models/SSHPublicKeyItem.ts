/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SSHPublicKey } from "./SSHPublicKey";
import type { SSHPublicKeyID } from "./SSHPublicKeyID";

/**
 * An SSH public key ID and the actual key itself. Useful when listing SSH public keys on an account.
 */
export type SSHPublicKeyItem = {
	id: SSHPublicKeyID;
	name: string;
	public_key?: SSHPublicKey;
};
