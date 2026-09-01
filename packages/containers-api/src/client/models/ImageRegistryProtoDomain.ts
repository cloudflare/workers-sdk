/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { Domain } from "./Domain";

/**
 * The domain and path that the proto is going to resolve to when the Cloudchamber runtime tries to pull from it.
 */
export type ImageRegistryProtoDomain = {
	domain: Domain;
	path: string;
};
