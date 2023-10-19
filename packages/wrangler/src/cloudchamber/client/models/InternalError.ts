/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * An internal error. Usually happens when Coordinator fails to perform some action with the database
 */
export type InternalError = {
	error: string;
	request_id: string;
};
