/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Label } from "./Label";
import type { NetworkParameters } from "./NetworkParameters";

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
	/**
	 * The scheduling policy to use
	 */
	scheduling_policy: CreateApplicationRequest.scheduling_policy;
	/**
	 * Number of deployments to create
	 */
	instances: number;
	/**
	 * Deployment labels
	 */
	labels?: Array<Label>;
};

export namespace CreateApplicationRequest {
	/**
	 * The scheduling policy to use
	 */
	export enum scheduling_policy {
		MOON = "moon",
	}
}
