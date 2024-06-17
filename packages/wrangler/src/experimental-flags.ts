import { AsyncLocalStorage } from "async_hooks";

type ExperimentalFlags = {
	DEV_ENV: boolean;
	FILE_BASED_REGISTRY: boolean;
};

const flags = new AsyncLocalStorage<ExperimentalFlags>();

export const run = <V>(flagValues: ExperimentalFlags, cb: () => V) =>
	flags.run(flagValues, cb);

export const FILE_BASED_REGISTRY = () => flags.getStore()?.FILE_BASED_REGISTRY;

// TODO: actually use this
export const DEV_ENV = () => flags.getStore()?.DEV_ENV;
