/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * An application status shows information about the application's scheduling status, job queue and other metadata.
 */
export type ApplicationStatus = {
	scheduler: Record<string, any>;
	/**
	 * Job queue status
	 */
	jobs: Record<string, any>;
};
