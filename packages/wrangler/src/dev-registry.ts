import { DevRegistry } from "miniflare";
import { getRegistryPath } from "./environment-variables/misc-variables";

const DEV_REGISTRY_PATH = getRegistryPath();

export type { WorkerRegistry, WorkerEntrypointsDefinition } from "miniflare";

export const devRegistry = new DevRegistry(DEV_REGISTRY_PATH);
