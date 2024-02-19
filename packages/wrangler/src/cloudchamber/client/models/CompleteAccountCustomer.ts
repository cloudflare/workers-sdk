/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountDefaults } from "./AccountDefaults";
import type { AccountID } from "./AccountID";
import type { AccountLimit } from "./AccountLimit";
import type { CompleteAccountLocationCustomer } from "./CompleteAccountLocationCustomer";
import type { Identity } from "./Identity";

/**
 * Represents a Cloudchamber account object with limits, locations and its defaults. It's the view for the customer.
 */
export type CompleteAccountCustomer = {
	external_account_id: AccountID;
	legacy_identity: Identity;
	limits: AccountLimit;
	locations: Array<CompleteAccountLocationCustomer>;
	defaults: AccountDefaults;
};
