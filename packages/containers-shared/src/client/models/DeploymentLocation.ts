/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { LocationID } from "./LocationID";
import type { Region } from "./Region";

/**
 * Represents some rich information about a location including it's enabled status
 */
export type DeploymentLocation = {
	name: LocationID;
	/**
	 * Shows if the location is enabled to run deployments
	 */
	enabled: boolean;
	/**
	 * Shows the region of the location
	 */
	region?: Region;
};
