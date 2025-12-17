/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Domain } from "./Domain";
import type { ExternalRegistryKind } from "./ExternalRegistryKind";
import type { ImageRegistryAuth } from "./ImageRegistryAuth";

/**
 * Request body for creating a new image registry configuration
 */
export type CreateImageRegistryRequestBody = {
	domain: Domain;
	/**
	 * If you own the registry and is private, this should be false or not defined. If it's a public registry like docker.io, you should set this to true
	 */
	is_public?: boolean;
	auth?: ImageRegistryAuth;
	kind?: ExternalRegistryKind;
};
