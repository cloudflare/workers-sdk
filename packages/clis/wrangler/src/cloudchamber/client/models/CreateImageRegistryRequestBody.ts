/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Domain } from "./Domain";

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
};
