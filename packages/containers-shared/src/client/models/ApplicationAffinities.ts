/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationAffinityColocation } from "./ApplicationAffinityColocation";

/**
 * Defines affinity in application scheduling. (This still an experimental feature, some schedulers might not work with these affinities).
 *
 */
export type ApplicationAffinities = {
	colocation?: ApplicationAffinityColocation;
};
