/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type ApplicationHealthInstances = {
	/**
	 * Number of active containers in this application.
	 *
	 */
	active: number;
	/**
	 * Number of healthy instances. If the application is attached to a DO namespace,
	 * this represents the number of prepared container instances.
	 *
	 */
	healthy: number;
	/**
	 * Number of failing container instances.
	 *
	 */
	failed: number;
	/**
	 * Number of container instances that are being prepared.
	 *
	 */
	starting: number;
	/**
	 * Number of container instances pending to be scheduled.
	 *
	 */
	scheduling: number;
};
