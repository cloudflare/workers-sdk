/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ContainerInstanceGroupSSHConfiguration } from "./ContainerInstanceGroupSSHConfiguration";

export type PutContainerInstanceGroupRequestBody = {
	class_name: string;
	name: string;
	ssh?: ContainerInstanceGroupSSHConfiguration;
};
