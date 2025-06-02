/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { AccountLocation } from "./AccountLocation";
import type { AccountLocationLimitsAsProperty } from "./AccountLocationLimitsAsProperty";
import type { Location } from "./Location";

/**
 * Represents an account location with a limit property for customers.
 */
export type CompleteAccountLocationCustomer = AccountLocationLimitsAsProperty &
	AccountLocation &
	Location;
