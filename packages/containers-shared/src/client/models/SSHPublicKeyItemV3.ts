/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { SSHPublicKey } from "./SSHPublicKey";

/**
 * An SSH public key attached to a specific application or account.
 */
export type SSHPublicKeyItemV3 = {
	name: string;
	public_key: SSHPublicKey;
};
