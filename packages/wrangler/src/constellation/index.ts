import { DeprecationError } from "../errors";
import type { CommonYargsArgv } from "../yargs-types";

export const constellationOptions = (yargs: CommonYargsArgv) => {
	return yargs;
};

export const constellationHandler = () => {
	throw new DeprecationError(
		"`wrangler constellation` has been deprecated, please refer to https://developers.cloudflare.com/ai for alternatives"
	);
};
