import { logger } from "../logger";
import { type ParseError } from "../parse";
import { getAccountId } from "../user";

const isFetchError = (err: unknown): err is ParseError => err instanceof Error;

export const HandleUnauthorizedError = async (_msg: string, err: Error) => {
	//@ts-expect-error non-standard property on Error
	if (isFetchError(err) && err.code === 10023) {
		const accountId = await getAccountId();
		if (accountId) {
			return logger.log(
				`You do not have Queues enabled on your account. Go to https://dash.staging.cloudflare.com/${accountId}/workers/queues to enable.`
			);
		}
	}
	throw err;
};
