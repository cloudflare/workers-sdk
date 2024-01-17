/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountID } from "./AccountID";
import type { Identity } from "./Identity";

/**
 * Response for the GET /whoami endpoint
 */
export type WhoamiResponse = {
	identity: Identity;
	account_id: AccountID;
	capabilities: Array<string>;
};
