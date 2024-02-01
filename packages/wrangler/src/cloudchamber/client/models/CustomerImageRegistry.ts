/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Domain } from "./Domain";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * An image registry added in a customer account
 */
export type CustomerImageRegistry = {
	/**
	 * A base64 representation of the public key that you can set to configure the registry. If null, the registry is public and doesn't have authentication setup with Cloudchamber
	 */
	public_key?: string;
	domain: Domain;
	created_at: ISO8601Timestamp;
};
