import { UserError } from "../errors";
import { logger } from "../logger";
import { type ParseError } from "../parse";
import { getAccountId } from "../user";
import {
	INVALID_CONSUMER_SETTINGS_ERROR,
	INVALID_QUEUE_SETTINGS_ERROR,
} from "./constants";

const isFetchError = (err: unknown): err is ParseError => err instanceof Error;

export const handleUnauthorizedError = async (err: Error | unknown) => {
	//@ts-expect-error non-standard property on Error
	if (isFetchError(err) && err.code === 10023) {
		const accountId = await getAccountId();
		if (accountId) {
			logger.error(
				`Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/${accountId}/workers/queues to enable it.`
			);

			return;
		}
	}

	// TODO(consider): should this rethrow?
};

export function handleFetchError(e: { code?: number }): void {
	if (e.code === INVALID_CONSUMER_SETTINGS_ERROR) {
		throw new UserError(`The specified consumer settings are invalid.`);
	}

	if (e.code === INVALID_QUEUE_SETTINGS_ERROR) {
		throw new UserError(`The specified queue settings are invalid.`);
	}

	throw e;
}
