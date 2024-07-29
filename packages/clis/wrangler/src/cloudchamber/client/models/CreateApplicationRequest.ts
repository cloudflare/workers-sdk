/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Label } from "./Label";
import type { NetworkParameters } from "./NetworkParameters";
import type { SchedulingPolicy } from "./SchedulingPolicy";

/**
 * Create a new application object for dynamic scheduling
 */
export type CreateApplicationRequest = {
	/**
	 * The name for this application
	 */
	name: string;
	/**
	 * The image to be dynamically scheduled
	 */
	image: string;
	network?: NetworkParameters;
	scheduling_policy: SchedulingPolicy;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	/**
	 * Deployment labels
	 */
	labels?: Array<Label>;
};
