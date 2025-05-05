/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ApplicationPriority } from "./ApplicationPriority";

/**
 * Defines priorities of application instances that are taken into account in scheduling decisions
 * and used to determine what instances should be evicted in the face of resource scarcity.
 * The feature is experimental and only supported with the "gpu" scheduling policy.
 *
 */
export type ApplicationPriorities = {
	default: ApplicationPriority;
};
