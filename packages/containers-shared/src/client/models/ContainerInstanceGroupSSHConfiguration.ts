/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserSSHPublicKey } from "./UserSSHPublicKey";

export type ContainerInstanceGroupSSHConfiguration = {
	enabled?: boolean;
	authorized_keys?: Array<UserSSHPublicKey>;
};
