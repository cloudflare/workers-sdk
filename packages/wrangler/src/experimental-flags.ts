import { AsyncLocalStorage } from "async_hooks";

type ExperimentalFlags = {
	// TODO: use this
	DEV_ENV: boolean;
	FILE_BASED_REGISTRY: boolean;
};

const flags = new AsyncLocalStorage<ExperimentalFlags>();

export const run = <V>(flagValues: ExperimentalFlags, cb: () => V) =>
	flags.run(flagValues, cb);

export const getFlag = <F extends keyof ExperimentalFlags>(flag: F) => {
	const store = flags.getStore();
	if (store === undefined) {
		throw new Error("No experimental flag store instantiated");
	}
	const value = flags.getStore()?.[flag];
	if (value === undefined) {
		throw new Error(
			`Attempted to use flag "${flag}" which has not been instantiated`
		);
	}
	return value;
};
