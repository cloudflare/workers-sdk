/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { LocationID } from "./LocationID";

/**
 * Represents a complete location object used for setting limits to users and seeing the list of available locations in Coordinator
 */
export type Location = {
	/**
	 * Location name that will be showcased to the user when they see which locations can they schedule on
	 */
	name: string;
	/**
	 * Defines a region to the location. This is useful so the client can group locations in regions to showcase them in groups
	 */
	region: string;
	location: LocationID;
};
