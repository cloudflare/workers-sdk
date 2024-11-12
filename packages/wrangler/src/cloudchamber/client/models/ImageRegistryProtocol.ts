/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ImageRegistryProtoDomain } from "./ImageRegistryProtoDomain";

/**
 * An image registry protocol (<proto>://<uri>) is a concept useful so you can refer to multiple registries within the same image ref.
 * In case you have multiple registries that are storing the same image, it will be highly available to Cloudchamber as it has multiple sources to pull from.
 * For example, you might push your image to a registry in "my-registry.com/images/hello:1.0", and to Cloudchamber's registry
 * "registry.cloudchamber.cfdata.org/hello:1.0".
 * You could call this proto "cf", and it would resolve to both my-registry.com/images and registry.cloudchamber.cfdata.org.
 * When you create a deployment/app with the format "cf://hello:1.0", the runtime will try to pull from "my-registry.com/images/hello:1.0"
 * or "registry.cloudchamber.cfdata.org/hello:1.0", depending on availability. If one pull fails it will fallback to the next target.
 * This is also useful to migrate to another registry progressively.
 *
 */
export type ImageRegistryProtocol = {
	proto: string;
	domains: Array<ImageRegistryProtoDomain>;
};
