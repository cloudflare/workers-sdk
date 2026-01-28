import { z } from "zod";
import { wrapResponse } from "../common";
import { zCloudflareD1ListDatabasesData } from "../generated/zod.gen";
import type { AppContext } from "../common";
import type { D1DatabaseResponse } from "../generated";

const _listDatabasesQuerySchema =
	zCloudflareD1ListDatabasesData.shape.query.unwrap();
type ListDatabasesQuery = z.output<typeof _listDatabasesQuerySchema>;

/**
 * List databases
 *
 * https://developers.cloudflare.com/api/node/resources/d1/subresources/database/methods/list/
 */
export async function listD1Databases(
	c: AppContext,
	query: ListDatabasesQuery
) {
	const {
		page,
		per_page,
		// name,
	} = query;

	const d1BindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.d1;
	let databases = Object.entries(d1BindingMap).map(([id, bindingName]) => {
		console.log({ id, bindingName });

		return {
			// created_at: new Date().toISOString(),
			name: "",
			uuid: crypto.randomUUID(),
			// version: "",
		} satisfies D1DatabaseResponse;
	});

	const totalCount = databases.length;

	const startIndex = (page - 1) * per_page;
	const endIndex = startIndex + per_page;
	databases = databases.slice(startIndex, endIndex);

	return c.json({
		...wrapResponse(databases),
		result_info: {
			count: databases.length,
			page,
			per_page,
			total_count: totalCount,
		},
	});
}
