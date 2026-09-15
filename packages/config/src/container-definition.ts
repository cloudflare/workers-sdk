import { createConfigDefiner } from "./definition";
import type { ConfigInput } from "./definition";
import type { ContainerConfig } from "./types";

export type ContainerConfigExport<T extends ContainerConfig = ContainerConfig> =
	ConfigInput<T>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

/**
 * Authored Container config shape — {@link ContainerConfig} without the `type`
 * discriminant, which `defineContainer` injects.
 */
export type ContainerConfigInput = DistributiveOmit<ContainerConfig, "type">;

/** Declare a Container application. */
export const defineContainer = createConfigDefiner<
	ContainerConfigInput,
	"container"
>("container");
