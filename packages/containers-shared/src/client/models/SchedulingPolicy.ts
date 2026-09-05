/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The scheduling policy to use for an application
 */
export enum SchedulingPolicy {
	DURABLE_OBJECT = "durable_object",
	MOON = "moon",
	GPU = "gpu",
	REGIONAL = "regional",
	FILL_METALS = "fill_metals",
	DEFAULT = "default",
}
