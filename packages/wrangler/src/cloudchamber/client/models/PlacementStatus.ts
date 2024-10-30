/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { PlacementStatusHealth } from "./PlacementStatusHealth";

export type PlacementStatus = {
	/**
	 * Whether the deployment is healthy based on the configured health checks. If no health checks are configured for this deployment, this field is omitted from the response.
	 */
	health: PlacementStatusHealth;
	/**
	 * Whether the deployment is ready based on the configured readiness checks. If no readiness checks are configured for this deployment, this field has the same value as "healthy".
	 */
	ready?: boolean;
} & Record<string, any>;
