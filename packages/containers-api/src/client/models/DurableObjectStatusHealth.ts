/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Represents the durable object status of a Placement. If empty, should be assumed that it's disconnected.
 * - connected: The Placement is connected to a durable object.
 * - disconnected: The Placement got disconnected from a durable object.
 *
 */
export enum DurableObjectStatusHealth {
	CONNECTED = "connected",
	DISCONNECTED = "disconnected",
}
