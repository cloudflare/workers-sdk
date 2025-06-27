/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ObservabilityLogging } from "./ObservabilityLogging";
import type { ObservabilityLogs } from "./ObservabilityLogs";

/**
 * Settings for observability such as logging.
 */
export type Observability = {
	logging?: ObservabilityLogging;
	logs?: ObservabilityLogs;
};
