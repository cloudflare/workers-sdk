/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DeploymentCheckHTTPRequestBody } from "./DeploymentCheckHTTPRequestBody";
import type { DeploymentCheckKind } from "./DeploymentCheckKind";
import type { DeploymentCheckType } from "./DeploymentCheckType";
import type { Duration } from "./Duration";

/**
 * Health and readiness checks for a deployment
 */
export type DeploymentCheckRequestBody = {
	/**
	 * Optional name for the check. If omitted, a name will be generated automatically.
	 */
	name?: string;
	/**
	 * The type of check to perform. A TCP check succeeds if it can connect to the provided port. An HTTP check succeeds if it receives a successful HTTP response (2XX)
	 */
	type: DeploymentCheckType;
	/**
	 * Connect to the port using TLS
	 */
	tls?: boolean;
	/**
	 * The name of the port defined in the "ports" property of the deployment
	 */
	port: string;
	/**
	 * Configuration for HTTP checks. Only valid when "type" is "http"
	 */
	http?: DeploymentCheckHTTPRequestBody;
	/**
	 * How often the check should be performed
	 */
	interval: Duration;
	/**
	 * The amount of time to wait for the check to complete before considering the check to have failed
	 */
	timeout: Duration;
	/**
	 * Number of times to attempt the check before considering it to have failed
	 */
	attempts_before_failure?: number;
	/**
	 * The kind of check. A failed "healthy" check affects a deployment's "healthy" status, while a failed "ready" check affects a deployment's "ready" status
	 */
	kind: DeploymentCheckKind;
	/**
	 * Initial time period after container start during which failed checks will be ignored
	 */
	grace_period?: Duration;
};
