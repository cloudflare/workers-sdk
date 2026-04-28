/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationHealth } from "./ApplicationHealth";
import type { ApplicationID } from "./ApplicationID";
import type { ApplicationName } from "./ApplicationName";
import type { Image } from "./Image";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";

/**
 * Summary representation of a container application, returned by the Dash endpoint.
 * Contains only the fields needed for list display, not the full configuration.
 */
export type DashApplication = {
	id: ApplicationID;
	created_at: ISO8601Timestamp;
	updated_at: ISO8601Timestamp;
	name: ApplicationName;
	version: number;
	instances: number;
	image: Image;
	health: ApplicationHealth;
};
