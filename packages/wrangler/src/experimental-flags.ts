import { AsyncLocalStorage } from "async_hooks";
import { logger } from "./logger";

type ExperimentalFlags = {
	FILE_BASED_REGISTRY: boolean;
	MULTIWORKER: boolean;
	RESOURCES_PROVISION: boolean;
};

const flags = new AsyncLocalStorage<ExperimentalFlags>();

export const run = <V>(flagValues: ExperimentalFlags, cb: () => V) =>
	flags.run(flagValues, cb);

export const getFlag = <F extends keyof ExperimentalFlags>(flag: F) => {
	const store = flags.getStore();
	if (store === undefined) {
		logger.debug("No experimental flag store instantiated");
	}
	const value = flags.getStore()?.[flag];
	if (value === undefined) {
		logger.debug(
			`Attempted to use flag "${flag}" which has not been instantiated`
		);
	}
	return value;
};
