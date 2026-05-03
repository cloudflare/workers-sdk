/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DashApplicationDurableObjectInstance } from "./DashApplicationDurableObjectInstance";
import type { DashApplicationInstance } from "./DashApplicationInstance";

export type DashApplicationInstances = {
	instances: DashApplicationInstance[];
	durable_objects?: DashApplicationDurableObjectInstance[];
};
