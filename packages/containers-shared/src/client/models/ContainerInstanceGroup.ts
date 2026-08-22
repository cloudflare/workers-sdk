/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ContainerInstanceGroupSSHConfiguration } from "./ContainerInstanceGroupSSHConfiguration";

export type ContainerInstanceGroup = {
	namespace_id: string;
	class_name: string;
	name: string;
	ssh?: ContainerInstanceGroupSSHConfiguration;
	generation: number;
};
