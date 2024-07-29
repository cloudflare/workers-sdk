/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * A secret item with its name and other metadata.
 */
export type SecretMetadata = {
	name: string;
	version: number;
	created_at: ISO8601Timestamp;
	updated_at: ISO8601Timestamp;
};
