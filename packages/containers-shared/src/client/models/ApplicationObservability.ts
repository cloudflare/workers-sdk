/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ObservabilityLogs } from "./ObservabilityLogs";

/**
 * Application-level observability settings.
 */
export type ApplicationObservability = {
	logs?: ObservabilityLogs;
	target_instance_percentage?: number;
	target_instance_count?: number;
};
