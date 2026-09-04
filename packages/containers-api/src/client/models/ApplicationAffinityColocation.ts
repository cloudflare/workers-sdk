/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Colocation affinity is designed so schedulers try to place application instances all in the same way. Colocation is best-effort depending on available resources. If there is some leftover set of instances
 * that can't be placed together, the scheduler will try to place them somewhere else.
 *
 */
export enum ApplicationAffinityColocation {
	DATACENTER = "datacenter",
}
