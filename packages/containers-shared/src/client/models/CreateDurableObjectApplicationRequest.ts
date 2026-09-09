/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DurableObjectsConfiguration } from "./DurableObjectsConfiguration";
import type { SchedulingPolicy } from "./SchedulingPolicy";

/**
 * Create a namespace-backed application whose instances are owned by Durable Objects.
 */
export type CreateDurableObjectApplicationRequest = {
	/**
	 * The name for this application.
	 */
	name: string;
	scheduling_policy: SchedulingPolicy.DURABLE_OBJECT;
	/**
	 * The customer-owned Durable Object namespace that owns this application and its instances.
	 */
	durable_objects: DurableObjectsConfiguration;
};
