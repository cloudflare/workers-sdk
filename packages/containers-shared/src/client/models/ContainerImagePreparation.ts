/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ContainerImagePreparationStatus } from "./ContainerImagePreparationStatus";

export type ContainerImagePreparation = {
	image: string;
	status: ContainerImagePreparationStatus;
	artifact_digest?: string;
	reason?: string;
};
