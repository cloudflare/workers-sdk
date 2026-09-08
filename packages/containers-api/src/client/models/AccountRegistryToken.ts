/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";

/**
 * An account registry token object that can be used to push and pull images to the registry's current account namespace
 */
export type AccountRegistryToken = {
	account_id: AccountID;
	registry_host: string;
	username: string;
	/**
	 * If password is unset, this registry is a public one that doesn't need credentials
	 */
	password?: string;
};
