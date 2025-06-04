/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The node type that a deployment can be deployed to. 'metal' defines normal Cloudflare metals, 'cloudchamber' is Cloudchamber nodes. For new accounts it should always be 'metal'.
 */
export enum NodeGroup {
	METAL = "metal",
	CLOUDCHAMBER = "cloudchamber",
}
