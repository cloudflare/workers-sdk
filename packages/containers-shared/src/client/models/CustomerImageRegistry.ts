/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { DefaultImageRegistryKind } from "./DefaultImageRegistryKind";
import type { Domain } from "./Domain";
import type { ExternalRegistryKind } from "./ExternalRegistryKind";
import type { ISO8601Timestamp } from "./ISO8601Timestamp";
import type { SecretsStoreRef } from "./SecretsStoreRef";

/**
 * An image registry added in a customer account
 */
export type CustomerImageRegistry = {
	/**
	 * A base64 representation of the public key that you can set to configure the registry. If null, the registry is public and doesn't have authentication setup with Cloudchamber
	 */
	public_key?: string;
	private_credential?: SecretsStoreRef;
	domain: Domain;
	/**
	 * The type of registry that is being configured.
	 */
	kind?: ExternalRegistryKind | DefaultImageRegistryKind;
	created_at: ISO8601Timestamp;
};
