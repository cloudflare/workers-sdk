/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { HTTPMethod } from "./HTTPMethod";

/**
 * Configuration for HTTP checks.
 */
export type DeploymentCheckHTTPRequestBody = {
	method?: HTTPMethod;
	/**
	 * If the method is one of POST, PATCH or PUT, this is required. It's the body that will be passed to the HTTP healthcheck request.
	 */
	body?: string;
	/**
	 * Path that will be used to perform the healthcheck.
	 */
	path?: string;
	/**
	 * HTTP headers to include in the request.
	 */
	headers?: Record<string, any>;
};
