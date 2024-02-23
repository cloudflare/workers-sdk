import { logger } from "../logger";
import { type ParseError } from "../parse";
import { getAccountId } from "../user";
import { INVALID_CONSUMER_SETTINGS_ERROR, INVALID_QUEUE_SETTINGS_ERROR } from "./constants";
import { UserError } from "../errors";

const isFetchError = (err: unknown): err is ParseError => err instanceof Error;

export const HandleUnauthorizedError = async (_msg: string, err: Error) => {
	//@ts-expect-error non-standard property on Error
	if (isFetchError(err) && err.code === 10023) {
		const accountId = await getAccountId();
		if (accountId) {
			return logger.log(
				`Queues is not currently enabled on this account. Go to https://dash.cloudflare.com/${accountId}/workers/queues to enable it.`
			);
		}
	}
	throw err;
};

export function handleFetchError(e: {code?: number}): void {
	if (e.code === INVALID_CONSUMER_SETTINGS_ERROR) {
		throw new UserError(`The specified consumer settings are invalid.`);
	}

	if (e.code === INVALID_QUEUE_SETTINGS_ERROR) {
		throw new UserError(`The specified queue settings are invalid.`);
	}

	throw e;
}
