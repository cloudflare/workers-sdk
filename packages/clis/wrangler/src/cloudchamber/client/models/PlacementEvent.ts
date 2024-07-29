/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * An event within a Placement
 */
export type PlacementEvent = {
	id: string;
	time: ISO8601Timestamp;
	type: string;
	name: string;
	message: string;
	details: Record<string, any>;
	statusChange: Record<string, any>;
};
