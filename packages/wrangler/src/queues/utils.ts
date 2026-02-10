import { UserError } from "@cloudflare/workers-utils";
import {
	INVALID_CONSUMER_SETTINGS_ERROR,
	INVALID_QUEUE_SETTINGS_ERROR,
} from "./constants";

export function handleFetchError(e: { code?: number }): void {
	if (e.code === INVALID_CONSUMER_SETTINGS_ERROR) {
		throw new UserError(`The specified consumer settings are invalid.`);
	}

	if (e.code === INVALID_QUEUE_SETTINGS_ERROR) {
		throw new UserError(`The specified queue settings are invalid.`);
	}

	throw e;
}
