/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentType } from "./DeploymentType";
import type { Placement } from "./Placement";

export type DashApplicationInstance = {
	id: string;
	created_at: string;
	current_placement?: Placement;
	type?: DeploymentType;
	location: string;
	region?: string;
	app_version: number;
	name?: string;
	image?: string;
};
