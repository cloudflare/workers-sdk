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
	/**
	 * The domain of the registry. It shouldn't contain the proto part of the domain, for example 'domain.com' is allowed, 'https://domain.com' is not
	 */
	domain: Domain;
	/**
	 * If you own the registry and is private, this should be false or not defined. If it's a public registry like docker.io, you should set this to true
	 */
	is_public?: boolean;
	/** Credentials needed to authenticate with an external image registry. */
	auth?: ImageRegistryAuth;
	/** The type of external registry that is being configured. */
	kind?: ExternalRegistryKind;
};
