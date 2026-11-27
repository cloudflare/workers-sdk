/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { UserSSHPublicKey } from "./UserSSHPublicKey";
import type { WranglerSSHConfig } from "./WranglerSSHConfig";

/**
 * Application-wide settings for a Durable Object-managed application.
 */
export type DurableObjectApplicationConfiguration = {
	wrangler_ssh?: WranglerSSHConfig;
	authorized_keys?: Array<UserSSHPublicKey>;
	/**
	 * Opt-in experimental flags for this application. Users can set only a subset of
	 * experimental flags; the API rejects unsupported values. An empty array clears
	 * the user-specified flags.
	 *
	 */
	experimental_flags?: Array<string>;
};
