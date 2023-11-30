import type { CommonYargsArgv } from "../yargs-types";
import { DeprecationError } from "../errors";

export const constellationOptions = (yargs: CommonYargsArgv) => {
	return yargs;
};

export const constellationHandler = () => {
	throw new DeprecationError(
		"`wrangler constellation` has been deprecated, please refer to https://developers.cloudflare.com/ai for alternatives"
	);
};
