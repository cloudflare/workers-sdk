import { wrapResponse } from "../common";
import type { AppContext } from "../common";

/**
 * List databases
 *
 * https://developers.cloudflare.com/api/node/resources/d1/subresources/database/methods/list/
 */
export async function listD1Databases(c: AppContext, _query: unknown) {
	return c.json({
		...wrapResponse([]),
		result_info: {},
	});
}
