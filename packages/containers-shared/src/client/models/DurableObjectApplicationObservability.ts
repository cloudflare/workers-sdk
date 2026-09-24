/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Application-wide logging settings for a Durable Object-managed application.
 * The application publishes these settings to its runtime metadata. Updating
 * them does not create a deployment or rollout.
 *
 */
export type DurableObjectApplicationObservability = {
	/**
	 * Application-wide logging settings.
	 */
	logs?: {
		enabled?: boolean;
	};
};
