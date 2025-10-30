import { AsyncLocalStorage } from "async_hooks";
import { logger } from "./logger";

export type ExperimentalFlags = {
	MULTIWORKER: boolean;
	RESOURCES_PROVISION: boolean;
	DEPLOY_REMOTE_DIFF_CHECK: boolean;
	AUTOCREATE_RESOURCES: boolean;
};

// In some contexts (e.g. getPlatformProxy) we don't necessarily have a flag store
// instantiated when we want to read a value. This provides defaults for some flags in those cases
const flagDefaults: Partial<Record<keyof ExperimentalFlags, boolean>> = {
	RESOURCES_PROVISION: true,
	AUTOCREATE_RESOURCES: true,
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
	return value ?? flagDefaults[flag];
};
