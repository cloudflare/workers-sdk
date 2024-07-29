/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { LocationID } from "./LocationID";
import type { Region } from "./Region";

/**
 * Represents a complete location object used for setting limits to users and seeing the list of available locations in Coordinator
 */
export type Location = {
	/**
	 * Location name that will be showcased to the user when they see which locations can they schedule on
	 */
	name: string;
	region: Region;
	location: LocationID;
};
