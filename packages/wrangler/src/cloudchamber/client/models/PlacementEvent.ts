/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { EventName } from "./EventName";
import type { EventType } from "./EventType";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * An event within a Placement or a Job
 */
export type PlacementEvent = {
	id: string;
	time: ISO8601Timestamp;
	type: EventType;
	name: EventName;
	message: string;
	details: Record<string, any>;
	statusChange: Record<string, any>;
};
