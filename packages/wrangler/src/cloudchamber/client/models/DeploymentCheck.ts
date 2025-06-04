/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentCheckHTTP } from "./DeploymentCheckHTTP";
import type { DeploymentCheckRequestBody } from "./DeploymentCheckRequestBody";

export type DeploymentCheck = DeploymentCheckRequestBody & {
	/**
	 * Name of the check
	 */
	name: string;
	/**
	 * Options for HTTP checks. Only valid when "type" is "http"
	 */
	http?: DeploymentCheckHTTP;
	/**
	 * Connect to the port using TLS
	 */
	tls: boolean;
	/**
	 * Number of times to attempt the check before considering it to have failed
	 */
	attempts_before_failure: number;
};
