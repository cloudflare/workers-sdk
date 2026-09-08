/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ImageRegistryPermissions } from "./ImageRegistryPermissions";

/**
 * Configuration to create credentials to access an image registry
 */
export type ImageRegistryCredentialsConfiguration = {
	permissions: Array<ImageRegistryPermissions>;
	expiration_minutes: number;
};
