import { logger } from "../../logger";

export class NotImplementedError extends Error {
	constructor(func: string, namespace?: string) {
		if (namespace) func = `${namespace}#${func}`;
		super(`Not Implemented Error: ${func}`);
	}
}

export function notImplemented(func: string, namespace?: string) {
	if (namespace) func = `${namespace}#${func}`;
	logger.debug(`Not Implemented Error: ${func}`);

	return new NotImplementedError(func, namespace);
}
